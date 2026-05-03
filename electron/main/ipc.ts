import { ipcMain, shell } from 'electron';
import type { App, BrowserWindow } from 'electron';
import { waitForPaperclipHealth } from '../services/port-discovery.js';
import { getPaperclipDataDir } from '../utils/data-dir.js';
import type { PaperclipServerManager } from './server-manager.js';
import { checkForUpdatesInteractive } from './updater.js';

export function registerIpcHandlers(
  app: App,
  getMainWindow: () => BrowserWindow | null,
  getServerManager: () => PaperclipServerManager | null,
): void {
  ipcMain.handle('oneearning:get-service-log', () => {
    return getServerManager()?.getLogTail() ?? '(无服务进程)';
  });

  ipcMain.handle('oneearning:restart-paperclip', async () => {
    const mgr = getServerManager();
    const win = getMainWindow();
    if (!mgr || !win) return;
    await mgr.restart((line) => {
      win.webContents.send('oneearning:server-status', { message: line });
    });
    const listenPort = await waitForPaperclipHealth(() => mgr.getEffectiveListenPort(), {
      timeoutMs: 120_000,
      getAbortReason: () => mgr.getStartupAbortReason(),
    });
    if (!win.isDestroyed()) await win.loadURL(`http://127.0.0.1:${listenPort}/`);
  });

  ipcMain.on('oneearning:open-data-dir', () => {
    void shell.openPath(getPaperclipDataDir(app));
  });

  ipcMain.handle('oneearning:get-data-dir', () => getPaperclipDataDir(app));

  ipcMain.handle('oneearning:check-updates', async () => {
    await checkForUpdatesInteractive();
  });
}
