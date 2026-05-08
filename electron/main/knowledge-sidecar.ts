/**
 * 本地启动 servers/knowledge 侧车（动态端口），供渲染进程经 /api/oneearning/knowledge/* 访问。
 */
import { type ChildProcess, fork } from 'node:child_process';
import { basename, dirname } from 'node:path';
import type { App } from 'electron';
import getPort from 'get-port';
import { appendSidecarLine } from '../utils/sidecar-log.js';
import { setKnowledgeSidecarBaseUrl } from './paperclip-proxy.js';
import { getOneEarningKnowledgeRoot } from '../utils/knowledge-dir.js';
import { resolveNodeExecutable } from '../utils/node-resolve.js';
import { resolveSidecarEntryScript } from '../utils/resolve-sidecar-entry.js';

export interface KnowledgeSidecarDiagnostics {
  baseUrl: string | null;
  script: string | null;
  cwd: string | null;
  nodeExecutable: string | null;
  pid: number | undefined;
  /** 最近一次子进程退出码（仍在运行则为 null） */
  lastExitCode: number | null;
  lastExitSignal: NodeJS.Signals | null;
}

let diagnosticsSnapshot: KnowledgeSidecarDiagnostics = {
  baseUrl: null,
  script: null,
  cwd: null,
  nodeExecutable: null,
  pid: undefined,
  lastExitCode: null,
  lastExitSignal: null,
};

function setDiag(p: Partial<KnowledgeSidecarDiagnostics>): void {
  diagnosticsSnapshot = { ...diagnosticsSnapshot, ...p };
}

/** IPC：排查「仅安装包失败」时用，避免猜侧车状态 */
export function getKnowledgeSidecarDiagnosticsSnapshot(): KnowledgeSidecarDiagnostics {
  return { ...diagnosticsSnapshot };
}

function resolveEntryScript(app: App): string | null {
  return resolveSidecarEntryScript(app, 'knowledge');
}

export class KnowledgeSidecarManager {
  private child: ChildProcess | null = null;

  private baseUrl: string | null = null;

  async start(app: App): Promise<void> {
    await this.stop();
    const script = resolveEntryScript(app);
    if (!script) {
      console.warn('[OneEarning] Knowledge sidecar script not found; knowledge search disabled.');
      setKnowledgeSidecarBaseUrl(null);
      setDiag({
        baseUrl: null,
        script: null,
        cwd: null,
        nodeExecutable: null,
        pid: undefined,
      });
      appendSidecarLine(app, 'knowledge', 'resolveEntryScript: null (packaged script missing?)');
      return;
    }

    const port = await getPort({ port: 38741 });
    const kbRoot = getOneEarningKnowledgeRoot(app);
    const scriptDir = dirname(script);
    const cwd = basename(scriptDir) === 'dist' ? dirname(scriptDir) : scriptDir;
    const nodeExecutable = resolveNodeExecutable(app);

    const pipeStream = (stream: NodeJS.ReadableStream | null, label: 'stdout' | 'stderr'): void => {
      stream?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (line.length > 0) {
            appendSidecarLine(app, 'knowledge', `${label}: ${line}`);
          }
        }
      });
    };

    this.child = fork(script, [], {
      cwd,
      execPath: nodeExecutable,
      env: {
        ...process.env,
        PORT: String(port),
        ONEEARNING_KB_ROOT: kbRoot,
      },
      /** Windows：silent:false 易弹出空白控制台 */
      silent: true,
      execArgv: [],
    });
    pipeStream(this.child.stdout, 'stdout');
    pipeStream(this.child.stderr, 'stderr');

    this.baseUrl = `http://127.0.0.1:${port}`;
    setKnowledgeSidecarBaseUrl(this.baseUrl);

    setDiag({
      baseUrl: this.baseUrl,
      script,
      cwd,
      nodeExecutable,
      pid: this.child.pid,
      lastExitCode: null,
      lastExitSignal: null,
    });

    appendSidecarLine(
      app,
      'knowledge',
      `spawn pid=${this.child.pid} node=${nodeExecutable} cwd=${cwd} script=${script} PORT=${port} ONEEARNING_KB_ROOT=${kbRoot}`,
    );

    this.child.on('exit', (code, signal) => {
      console.warn('[OneEarning] Knowledge sidecar exited', code, signal);
      appendSidecarLine(
        app,
        'knowledge',
        `exit code=${code ?? 'null'} signal=${signal ?? ''}`,
      );
      setDiag({
        baseUrl: null,
        pid: undefined,
        lastExitCode: typeof code === 'number' ? code : null,
        lastExitSignal: signal ?? null,
      });
      this.child = null;
      this.baseUrl = null;
      setKnowledgeSidecarBaseUrl(null);
    });

    this.child.on('error', (err) => {
      console.error('[OneEarning] Knowledge sidecar error', err);
      appendSidecarLine(app, 'knowledge', `fork error: ${err instanceof Error ? err.message : String(err)}`);
      this.child = null;
      this.baseUrl = null;
      setKnowledgeSidecarBaseUrl(null);
      setDiag({ baseUrl: null, pid: undefined });
    });

    console.error('[OneEarning] Knowledge sidecar started', this.baseUrl, script);
  }

  async stop(): Promise<void> {
    setKnowledgeSidecarBaseUrl(null);
    if (!this.child) {
      this.baseUrl = null;
      setDiag({ baseUrl: null, pid: undefined });
      return;
    }
    try {
      this.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.child = null;
    this.baseUrl = null;
    setDiag({ baseUrl: null, pid: undefined });
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }
}
