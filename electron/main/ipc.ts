import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve as resolvePath } from 'node:path';
import { dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import type { App, BrowserWindow } from 'electron';
import { waitForPaperclipHealth } from '../services/port-discovery.js';
import { getPaperclipDataDir } from '../utils/data-dir.js';
import { getAgentKnowledgeDir } from '../utils/knowledge-dir.js';
import type { PaperclipServerManager } from './server-manager.js';
import { checkForUpdatesInteractive } from './updater.js';
import { paperclipProxyFetch } from './paperclip-proxy.js';
import {
  notifyPaperclipReadyAfterRestart,
  onRendererShellReady,
} from './paperclip-ready-coordinator.js';
import type { PaperclipFetchRequest } from '../shared/paperclip-ipc.js';

function paperclipBaseUrl(mgr: PaperclipServerManager | null): string {
  const port = mgr?.getEffectiveListenPort() ?? 0;
  return `http://127.0.0.1:${port}`;
}

export function registerIpcHandlers(
  app: App,
  getMainWindow: () => BrowserWindow | null,
  getServerManager: () => PaperclipServerManager | null,
): void {
  ipcMain.on('oneearning:shell-ready', (event) => {
    const win = getMainWindow();
    const senderId = event.sender.id;
    const mainId = win && !win.isDestroyed() ? win.webContents.id : -1;
    if (!win || win.isDestroyed()) {
      return;
    }
    /** 个别环境下 sender 与 win.webContents 引用不等但 id 相同 */
    if (senderId !== mainId) {
      return;
    }
    onRendererShellReady(win);
  });

  ipcMain.handle('oneearning:get-service-log', () => {
    return getServerManager()?.getLogTail() ?? '(无服务进程)';
  });

  ipcMain.handle('oneearning:get-paperclip-base-url', () => {
    return paperclipBaseUrl(getServerManager());
  });

  ipcMain.handle('oneearning:paperclip-fetch', async (_evt, request: PaperclipFetchRequest) => {
    const mgr = getServerManager();
    if (!mgr) {
      return { ok: false as const, error: 'Paperclip server not running' };
    }
    return paperclipProxyFetch(paperclipBaseUrl(mgr), request);
  });

  ipcMain.handle('oneearning:open-external-safe', async (_evt, url: string) => {
    if (typeof url !== 'string') {
      throw new Error('Invalid URL');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Protocol not allowed');
    }
    const host = parsed.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error('Only loopback URLs are allowed');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('oneearning:restart-paperclip', async () => {
    const mgr = getServerManager();
    const win = getMainWindow();
    if (!mgr || !win) return;
    await mgr.restart((line) => {
      win.webContents.send('oneearning:server-status', { message: line });
    });
    await waitForPaperclipHealth(() => mgr.getEffectiveListenPort(), {
      timeoutMs: 120_000,
      getAbortReason: () => mgr.getStartupAbortReason(),
    });
    if (!win.isDestroyed()) {
      notifyPaperclipReadyAfterRestart(win, getServerManager);
    }
  });

  ipcMain.on('oneearning:open-data-dir', () => {
    void shell.openPath(getPaperclipDataDir(app));
  });

  ipcMain.handle('oneearning:get-data-dir', () => getPaperclipDataDir(app));

  /** 将 Clawhub 解压后的多文件写入 Paperclip 数据目录下临时文件夹，供 POST /skills/import 走本地目录导入（文件清单完整）。 */
  ipcMain.handle(
    'oneearning:stage-clawhub-skill-directory',
    async (
      _evt,
      payload: { companyId: string; slugHint: string; files: { path: string; content: string }[] },
    ) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const slugHint =
        typeof payload?.slugHint === 'string' ? payload.slugHint.trim().replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48) : '';
      const files = Array.isArray(payload?.files) ? payload.files : [];
      if (!companyId.length || files.length === 0) {
        throw new Error('Invalid staging payload');
      }
      const safeSlug = slugHint.length > 0 ? slugHint : 'skill';
      const stamp = randomBytes(6).toString('hex');
      const resolvedRoot = resolvePath(
        join(getPaperclipDataDir(app), 'skills', companyId, `clawhub-${safeSlug}-${stamp}`),
      );
      for (const f of files) {
        const rel = typeof f.path === 'string' ? f.path.replace(/\\/g, '/').replace(/^\.\/+/, '') : '';
        if (!rel.length || rel.includes('..')) {
          throw new Error(`Invalid relative path: ${f.path}`);
        }
        const dest = resolvePath(join(resolvedRoot, ...rel.split('/').filter((s) => s.length > 0)));
        const relCheck = relative(resolvedRoot, dest);
        if (!relCheck || relCheck.startsWith('..') || relCheck.includes('..')) {
          throw new Error(`Path escapes staging root: ${rel}`);
        }
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, typeof f.content === 'string' ? f.content : '', 'utf8');
      }
      return resolvedRoot;
    },
  );

  ipcMain.handle('oneearning:check-updates', async () => {
    await checkForUpdatesInteractive();
  });

  const MAX_KB_IMPORT_BYTES = 50 * 1024 * 1024;
  const BLOCKED_IMPORT_EXT = new Set([
    'exe',
    'dll',
    'bat',
    'cmd',
    'msi',
    'scr',
    'com',
    'ps1',
    'vbs',
    'reg',
    'lnk',
  ]);

  ipcMain.handle(
    'oneearning:knowledge-get-root',
    (_evt, payload: { companyId: string; agentId: string }) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
      if (!companyId || !agentId) throw new Error('Invalid knowledge payload');
      return getAgentKnowledgeDir(app, companyId, agentId);
    },
  );

  ipcMain.handle(
    'oneearning:knowledge-open-dir',
    async (_evt, payload: { companyId: string; agentId: string }) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
      if (!companyId || !agentId) throw new Error('Invalid knowledge payload');
      const dir = getAgentKnowledgeDir(app, companyId, agentId);
      await mkdir(dir, { recursive: true });
      const err = await shell.openPath(dir);
      if (err) throw new Error(err);
    },
  );

  async function walkKbFiles(
    root: string,
    base: string,
  ): Promise<Array<{ relPath: string; size: number; mtimeMs: number }>> {
    const out: Array<{ relPath: string; size: number; mtimeMs: number }> = [];
    const entries = await readdir(base, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const full = join(base, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '.index') continue;
        out.push(...(await walkKbFiles(root, full)));
      } else if (ent.isFile()) {
        const rel = relative(root, full).replace(/\\/g, '/');
        const st = await stat(full);
        out.push({ relPath: rel, size: st.size, mtimeMs: st.mtimeMs });
      }
    }
    return out;
  }

  ipcMain.handle(
    'oneearning:knowledge-list-files',
    async (_evt, payload: { companyId: string; agentId: string }) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
      if (!companyId || !agentId) throw new Error('Invalid knowledge payload');
      const root = getAgentKnowledgeDir(app, companyId, agentId);
      await mkdir(root, { recursive: true });
      return walkKbFiles(root, root);
    },
  );

  ipcMain.handle(
    'oneearning:knowledge-import-dialog',
    async (_evt, payload: { companyId: string; agentId: string }) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
      if (!companyId || !agentId) throw new Error('Invalid knowledge payload');
      const root = getAgentKnowledgeDir(app, companyId, agentId);
      await mkdir(root, { recursive: true });
      const win = getMainWindow();
      const dialogOpts: OpenDialogOptions = {
        properties: ['openFile', 'multiSelections'],
        title: '选择要导入的文件',
      };
      const { canceled, filePaths } =
        win && !win.isDestroyed()
          ? await dialog.showOpenDialog(win, dialogOpts)
          : await dialog.showOpenDialog(dialogOpts);
      if (canceled || filePaths.length === 0) return { imported: [] as string[] };

      const imported: string[] = [];
      for (const src of filePaths) {
        const baseName = basename(src);
        const ext = baseName.includes('.') ? baseName.split('.').pop()?.toLowerCase() ?? '' : '';
        if (ext.length > 0 && BLOCKED_IMPORT_EXT.has(ext)) continue;
        let st;
        try {
          st = await stat(src);
        } catch {
          continue;
        }
        if (!st.isFile() || st.size > MAX_KB_IMPORT_BYTES) continue;

        let destName = baseName;
        let dest = join(root, destName);
        let n = 1;
        while (existsSync(dest)) {
          const dot = baseName.lastIndexOf('.');
          const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
          const suf = dot > 0 ? baseName.slice(dot) : '';
          destName = `${stem}_${n}${suf}`;
          dest = join(root, destName);
          n++;
        }
        await copyFile(src, dest);
        imported.push(destName);
      }
      return { imported };
    },
  );

  ipcMain.handle(
    'oneearning:knowledge-delete-disk-file',
    async (_evt, payload: { companyId: string; agentId: string; relPath: string }) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
      const relPath =
        typeof payload?.relPath === 'string' ? payload.relPath.replace(/\\/g, '/').replace(/^\.\/+/, '') : '';
      if (!companyId || !agentId || !relPath.length || relPath.includes('..')) {
        throw new Error('Invalid delete payload');
      }
      const root = getAgentKnowledgeDir(app, companyId, agentId);
      const abs = resolvePath(root, ...relPath.split('/').filter((s) => s.length > 0));
      const relCheck = relative(root, abs);
      if (!relCheck || relCheck.startsWith('..') || relCheck.includes('..')) {
        throw new Error('Path escapes knowledge root');
      }
      await unlink(abs);
    },
  );

  ipcMain.handle(
    'oneearning:knowledge-open-file',
    async (_evt, payload: { companyId: string; agentId: string; relPath: string }) => {
      const companyId = typeof payload?.companyId === 'string' ? payload.companyId.trim() : '';
      const agentId = typeof payload?.agentId === 'string' ? payload.agentId.trim() : '';
      const relPath =
        typeof payload?.relPath === 'string' ? payload.relPath.replace(/\\/g, '/').replace(/^\.\/+/, '') : '';
      if (!companyId || !agentId || !relPath.length || relPath.includes('..')) {
        throw new Error('Invalid knowledge payload');
      }
      const root = getAgentKnowledgeDir(app, companyId, agentId);
      const abs = resolvePath(root, ...relPath.split('/').filter((s) => s.length > 0));
      const relCheck = relative(root, abs);
      if (!relCheck || relCheck.startsWith('..') || relCheck.includes('..')) {
        throw new Error('Path escapes knowledge root');
      }
      const err = await shell.openPath(abs);
      if (err) throw new Error(err);
    },
  );
}
