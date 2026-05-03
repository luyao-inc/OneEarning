import { ipcMain, shell } from 'electron';
import type { App, BrowserWindow } from 'electron';
import { waitForPaperclipHealth } from '../services/port-discovery.js';
import { getPaperclipDataDir } from '../utils/data-dir.js';
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

  ipcMain.handle('oneearning:check-updates', async () => {
    await checkForUpdatesInteractive();
  });
}
