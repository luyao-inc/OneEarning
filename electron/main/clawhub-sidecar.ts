/**
 * 本地启动 servers/clawhub 侧车（动态端口），供渲染进程经 /api/oneearning/clawhub/* 访问。
 */
import { type ChildProcess, fork } from 'node:child_process';
import { basename, dirname } from 'node:path';
import type { App } from 'electron';
import getPort from 'get-port';
import { setClawhubSidecarBaseUrl } from './paperclip-proxy.js';
import { resolveNodeExecutable } from '../utils/node-resolve.js';
import { resolveSidecarEntryScript } from '../utils/resolve-sidecar-entry.js';

function resolveEntryScript(app: App): string | null {
  return resolveSidecarEntryScript(app, 'clawhub');
}

export class ClawhubSidecarManager {
  private child: ChildProcess | null = null;

  private baseUrl: string | null = null;

  async start(app: App): Promise<void> {
    await this.stop();
    const script = resolveEntryScript(app);
    if (!script) {
      console.warn('[OneEarning] Clawhub sidecar script not found; Clawhub import disabled.');
      setClawhubSidecarBaseUrl(null);
      return;
    }

    const port = await getPort({ port: 38740 });
    const scriptDir = dirname(script);
    const cwd = basename(scriptDir) === 'dist' ? dirname(scriptDir) : scriptDir;
    this.child = fork(script, [], {
      cwd,
      execPath: resolveNodeExecutable(app),
      env: {
        ...process.env,
        PORT: String(port),
      },
      /** Windows：silent:false 会让 node 子进程继承控制台并弹出空白终端窗口 */
      silent: true,
      execArgv: [],
    });
    this.child.stdout?.resume();
    this.child.stderr?.resume();

    this.baseUrl = `http://127.0.0.1:${port}`;
    setClawhubSidecarBaseUrl(this.baseUrl);

    this.child.on('exit', (code, signal) => {
      console.warn('[OneEarning] Clawhub sidecar exited', code, signal);
      if (this.child?.pid === undefined) return;
      this.child = null;
      this.baseUrl = null;
      setClawhubSidecarBaseUrl(null);
    });

    this.child.on('error', (err) => {
      console.error('[OneEarning] Clawhub sidecar error', err);
    });

    console.error('[OneEarning] Clawhub sidecar started', this.baseUrl, script);
  }

  async stop(): Promise<void> {
    setClawhubSidecarBaseUrl(null);
    if (!this.child) return;
    try {
      this.child.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.child = null;
    this.baseUrl = null;
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }
}
