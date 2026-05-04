import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'electron';
import { getPaperclipDataDir, getPaperclipRoot } from '../utils/data-dir.js';
import { ensurePaperclipConfig } from '../utils/ensure-paperclip-config.js';
import { resolveNodeExecutable } from '../utils/node-resolve.js';
import { cleanupStaleEmbeddedPostgres } from '../utils/cleanup-embedded-postgres-stale.js';

const LOG_LINES = 400;

/** 去掉 pino / picocolors 等 ANSI 序列，便于解析端口与展示错误 */
function stripAnsi(line: string): string {
  return line
    .replace(/\u001b\[[\d;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][\d;]*\\/g, '')
    .replace(/\u001b[@-_]/g, '');
}

export class PaperclipServerManager {
  private child: ChildProcess | null = null;
  private logBuffer: string[] = [];
  /** 期望端口（传给 PORT）；Paperclip 可能因 detectPort 改用其它端口 */
  private readonly requestedPort: number;
  /** 从 stdout/stderr 解析到的实际 HTTP 监听端口 */
  private observedListenPort: number | null = null;
  private stopping = false;
  private childExitCode: number | null | undefined = undefined;

  constructor(
    private readonly app: App,
    requestedPort: number,
  ) {
    this.requestedPort = requestedPort;
  }

  /** 发起请求时用的端口：优先日志里解析到的真实端口 */
  getEffectiveListenPort(): number {
    return this.observedListenPort ?? this.requestedPort;
  }

  /** 兼容旧调用：仍返回当初分配的期望端口 */
  getPort(): number {
    return this.requestedPort;
  }

  getLogTail(): string {
    return this.logBuffer.join('\n');
  }

  /** 子进程非预期退出时给健康检查轮询用 */
  getStartupAbortReason(): string | null {
    if (this.stopping) return null;
    if (this.childExitCode === undefined) return null;
    if (this.childExitCode === 0 || this.childExitCode === null) return null;
    const tail = this.getLogTail().slice(-4000);
    const hint = /shared memory block is still in use|pre-existing shared memory/i.test(tail)
      ? '\n\n嵌入式 PostgreSQL 未完全释放（常见于上次异常退出）。已尝试清理 postmaster.pid；若仍失败请重启 Windows，或在任务管理器中结束仍占用数据目录下数据库的 postgres 进程。'
      : '';
    return `paperclip 进程已退出（exit code=${this.childExitCode}）。${hint}\n\n最近日志：\n${tail}`;
  }

  private tryCaptureListenPort(line: string): void {
    const clean = stripAnsi(line);
    const listenMatch = clean.match(/Server listening on .+:(\d+)/);
    const warnMatch = clean.match(/selectedPort=(\d+)/);
    const m = listenMatch ?? warnMatch;
    if (m?.[1]) {
      const p = Number(m[1]);
      if (Number.isFinite(p) && p > 0) this.observedListenPort = p;
    }
  }

  appendLog(line: string): void {
    this.tryCaptureListenPort(line);
    this.logBuffer.push(line);
    if (this.logBuffer.length > LOG_LINES) this.logBuffer.shift();
  }

  async start(onLine: (line: string) => void, opts?: { skipDoctor?: boolean }): Promise<void> {
    if (this.child) return;

    this.observedListenPort = null;
    this.childExitCode = undefined;
    this.stopping = false;

    const root = getPaperclipRoot(this.app);
    const entry = join(root, 'dist', 'index.js');
    if (!existsSync(entry)) {
      throw new Error(`未找到 paperclipai 入口：${entry}。请先 pnpm install 或执行打包脚本。`);
    }

    const dataDir = getPaperclipDataDir(this.app);
    const node = resolveNodeExecutable(this.app);
    const nodePath = join(root, 'node_modules');

    const env = {
      ...process.env,
      PORT: String(this.requestedPort),
      HOST: '127.0.0.1',
      PAPERCLIP_OPEN_ON_LISTEN: 'false',
      NODE_PATH: existsSync(nodePath) ? nodePath : process.env.NODE_PATH ?? '',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      CI: '1',
    };

    ensurePaperclipConfig(dataDir);
    cleanupStaleEmbeddedPostgres(dataDir, root);

    if (!opts?.skipDoctor) {
      const doctor = spawnSync(
        node,
        [entry, 'doctor', '--data-dir', dataDir, '--repair', '-y'],
        { cwd: root, env, windowsHide: true, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
      );
      if (doctor.stdout) {
        for (const raw of doctor.stdout.split(/\r?\n/)) {
          if (raw) onLine(stripAnsi(raw));
        }
      }
      if (doctor.stderr) {
        for (const raw of doctor.stderr.split(/\r?\n/)) {
          if (raw) onLine(stripAnsi(raw));
        }
      }
      if (doctor.status !== 0) {
        throw new Error(`paperclipai doctor 失败（退出码 ${doctor.status}）。请查看日志。`);
      }
    }

    /**
     * doctor 可能已拉起过嵌入式 PG；紧接着 run 再启同一数据目录时，Windows 上易出现
     * FATAL: pre-existing shared memory block is still in use。
     * 在 spawn run 前再清一次并短暂等待，与开发/生产安装包行为对齐。
     */
    cleanupStaleEmbeddedPostgres(dataDir, root);
    if (process.platform === 'win32') {
      await new Promise<void>((r) => {
        setTimeout(r, 1500);
      });
    }

    // paperclipai run 无 -y/--yes 选项（与 doctor 不同）；默认已带 --repair
    const args = [entry, 'run', '--data-dir', dataDir];

    const child = spawn(node, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    const push = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      for (const raw of text.split(/\r?\n/)) {
        if (!raw) continue;
        const line = stripAnsi(raw);
        this.appendLog(line);
        onLine(line);
      }
    };

    child.stdout?.on('data', push);
    child.stderr?.on('data', push);

    child.on('error', (err) => {
      this.appendLog(`[spawn error] ${err.message}`);
    });

    child.on('exit', (code) => {
      this.childExitCode = code;
      this.appendLog(`[paperclip exit] code=${code === null ? 'null' : code}`);
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('paperclipai 子进程 spawn 超时')), 5000);
      child.once('spawn', () => {
        clearTimeout(t);
        resolve();
      });
      child.once('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.child?.pid) return;
    this.stopping = true;
    const pid = this.child.pid;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true, stdio: 'ignore' });
      } else {
        this.child.kill('SIGTERM');
      }
    } catch {
      /* ignore */
    }
    this.child = null;
  }

  async restart(onLine: (line: string) => void): Promise<void> {
    await this.stop();
    await new Promise((r) => setTimeout(r, 800));
    await this.start(onLine, { skipDoctor: true });
  }
}
