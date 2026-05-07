/**
 * 本地启动 servers/knowledge 侧车（动态端口），供渲染进程经 /api/oneearning/knowledge/* 访问。
 */
import { type ChildProcess, fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App } from 'electron';
import getPort from 'get-port';
import { setKnowledgeSidecarBaseUrl } from './paperclip-proxy.js';
import { getOneEarningKnowledgeRoot } from '../utils/knowledge-dir.js';

function resolveEntryScript(app: App): string | null {
  const resources = process.resourcesPath;
  const packaged = join(resources, 'servers/knowledge/index.js');
  if (existsSync(packaged)) return packaged;

  const cwdDev = join(app.getAppPath(), 'servers/knowledge/dist/index.js');
  if (existsSync(cwdDev)) return cwdDev;

  const here = dirname(fileURLToPath(import.meta.url));
  const fromMain = join(here, '..', '..', 'servers', 'knowledge', 'dist', 'index.js');
  if (existsSync(fromMain)) return fromMain;

  return null;
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
      return;
    }

    const port = await getPort({ port: 38741 });
    const cwd = dirname(dirname(script));
    const kbRoot = getOneEarningKnowledgeRoot(app);
    this.child = fork(script, [], {
      cwd,
      env: {
        ...process.env,
        PORT: String(port),
        ONEEARNING_KB_ROOT: kbRoot,
      },
      silent: false,
      execArgv: [],
    });

    this.baseUrl = `http://127.0.0.1:${port}`;
    setKnowledgeSidecarBaseUrl(this.baseUrl);

    this.child.on('exit', (code, signal) => {
      console.warn('[OneEarning] Knowledge sidecar exited', code, signal);
      if (this.child?.pid === undefined) return;
      this.child = null;
      this.baseUrl = null;
      setKnowledgeSidecarBaseUrl(null);
    });

    this.child.on('error', (err) => {
      console.error('[OneEarning] Knowledge sidecar error', err);
    });

    console.error('[OneEarning] Knowledge sidecar started', this.baseUrl, script);
  }

  async stop(): Promise<void> {
    setKnowledgeSidecarBaseUrl(null);
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
