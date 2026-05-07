/**
 * 本地启动 servers/clawhub 侧车（动态端口），供渲染进程经 /api/oneearning/clawhub/* 访问。
 */
import { type ChildProcess, fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App } from 'electron';
import getPort from 'get-port';
import { setClawhubSidecarBaseUrl } from './paperclip-proxy.js';

function resolveEntryScript(app: App): string | null {
  const resources = process.resourcesPath;
  const packaged = join(resources, 'servers/clawhub/index.js');
  if (existsSync(packaged)) return packaged;

  const cwdDev = join(app.getAppPath(), 'servers/clawhub/dist/index.js');
  if (existsSync(cwdDev)) return cwdDev;

  const here = dirname(fileURLToPath(import.meta.url));
  const fromMain = join(here, '..', '..', 'servers', 'clawhub', 'dist', 'index.js');
  if (existsSync(fromMain)) return fromMain;

  return null;
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
    const cwd = dirname(dirname(script));
    this.child = fork(script, [], {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
      },
      silent: false,
      execArgv: [],
    });

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
