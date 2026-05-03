/**
 * OneEarning — Electron 主进程：启动 Paperclip 子进程、主窗口、托盘与 IPC。
 */
import { app, BrowserWindow, dialog, Menu } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import getPort from 'get-port';
import { PaperclipServerManager } from './server-manager.js';
import { waitForPaperclipHealth } from '../services/port-discovery.js';
import { loadShellStrings } from './i18n.js';
import { getAppIconPngPath } from './app-icon.js';
import { createTray } from './tray.js';
import { registerIpcHandlers } from './ipc.js';
import { checkForUpdatesInteractive } from './updater.js';
import { shouldApplyPaperclipZh } from '../utils/paperclip-url.js';

/**
 * Vite 开发模式下主进程 bundle 的 import.meta.url 可能不是 file:，
 * 不能对非 file URL 调用 fileURLToPath（会抛 ERR_INVALID_URL_SCHEME）。
 */
function resolveMainDirname(): string {
  const u = import.meta.url;
  if (typeof u === 'string' && u.startsWith('file:')) {
    try {
      return dirname(fileURLToPath(u));
    } catch {
      /* fall through */
    }
  }
  return join(app.getAppPath(), 'dist-electron', 'main');
}

const __dirname = resolveMainDirname();

const APP_DISPLAY_TITLE = 'OneEarning';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function bindFixedWindowTitle(win: BrowserWindow): void {
  win.setTitle(APP_DISPLAY_TITLE);
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle(APP_DISPLAY_TITLE);
  });
}

function windowIconOptions(): { icon: string } | Record<string, never> {
  const p = getAppIconPngPath();
  return p ? { icon: p } : {};
}

let mainWindow: BrowserWindow | null = null;
let serverManager: PaperclipServerManager | null = null;
let tray: Electron.Tray | null = null;

function preloadPath(): string {
  return join(__dirname, '../preload/index.js');
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: APP_DISPLAY_TITLE,
    ...windowIconOptions(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  bindFixedWindowTitle(win);

  win.webContents.on('did-finish-load', () => {
    const url = win.webContents.getURL();
    const gate = shouldApplyPaperclipZh(url);
    // #region agent log
    fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
      body: JSON.stringify({
        sessionId: 'e36b4c',
        hypothesisId: 'H1-H2-url-and-send',
        location: 'electron/main/index.ts:did-finish-load',
        message: 'paperclip i18n gate',
        data: {
          url,
          gate,
          willSend: gate,
          viteUrl: process.env.VITE_DEV_SERVER_URL ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (gate) {
      /** webContents.executeJavaScript 在隔离世界执行，读不到 contextBridge；mainFrame 在 page 世界执行 */
      void win.webContents.mainFrame
        .executeJavaScript(
          `(function(){try{var p={t:typeof window.oneEarning,names:Object.getOwnPropertyNames(window).filter(function(k){return /oneE|earn/i.test(k);}).slice(0,10)};if(window.oneEarning&&typeof window.oneEarning.applyPaperclipZh==='function'){window.oneEarning.applyPaperclipZh();return {ok:true,probe:p};}return {ok:false,reason:'no-bridge',probe:p};}catch(e){return {ok:false,reason:String(e&&e.message)};}})()`,
        )
        .then((bridgeResult: unknown) => {
          // #region agent log
          fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
            body: JSON.stringify({
              sessionId: 'e36b4c',
              hypothesisId: 'POST-FIX-main-bridge-result',
              location: 'electron/main/index.ts:did-finish-load',
              message: 'mainFrame.executeJavaScript applyPaperclipZh result',
              data: { bridgeResult, viaMainFrame: true },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        })
        .catch((err: unknown) => {
          // #region agent log
          fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
            body: JSON.stringify({
              sessionId: 'e36b4c',
              hypothesisId: 'POST-FIX-main-bridge-error',
              location: 'electron/main/index.ts:did-finish-load',
              message: 'mainFrame.executeJavaScript failed',
              data: { err: err instanceof Error ? err.message : String(err) },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
        });
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function loadSplash(win: BrowserWindow): void {
  if (isDev) {
    const url = `${process.env.VITE_DEV_SERVER_URL}`;
    void win.loadURL(url);
  } else {
    void win.loadFile(join(__dirname, '../../dist/index.html'));
  }
}

function openAuxWindow(route: 'about' | 'service' | 'settings'): void {
  const child = new BrowserWindow({
    width: route === 'service' ? 720 : 520,
    height: route === 'service' ? 540 : 420,
    title: APP_DISPLAY_TITLE,
    ...windowIconOptions(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    parent: mainWindow ?? undefined,
    modal: false,
  });
  bindFixedWindowTitle(child);
  const q = `route=${route}`;
  if (isDev) {
    void child.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${q}`);
  } else {
    void child.loadFile(join(__dirname, '../../dist/index.html'), {
      query: { route },
    });
  }
}

async function bootstrapPaperclip(win: BrowserWindow): Promise<void> {
  const port = await getPort({ port: 38473 });
  serverManager = new PaperclipServerManager(app, port);

  const pushStatus = (line: string) => {
    if (!win.isDestroyed()) win.webContents.send('oneearning:server-status', { message: line });
  };

  await serverManager.start(pushStatus);
  /** 首次 embedded Postgres + 迁移可能较慢；端口也可能与 PORT 不一致（detectPort 换端口） */
  const listenPort = await waitForPaperclipHealth(() => serverManager!.getEffectiveListenPort(), {
    timeoutMs: 600_000,
    intervalMs: 500,
    getAbortReason: () => serverManager?.getStartupAbortReason() ?? null,
  });

  await win.loadURL(`http://127.0.0.1:${listenPort}/`);
}

function setupShellUi(): void {
  const shellStrings = loadShellStrings(app);

  Menu.setApplicationMenu(null);

  if (tray) tray.destroy();
  tray = createTray(app, shellStrings, {
    onShow: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    onQuit: () => app.quit(),
    onAbout: () => openAuxWindow('about'),
    onService: () => openAuxWindow('service'),
    onSettings: () => openAuxWindow('settings'),
    onCheckUpdates: async () => {
      try {
        await checkForUpdatesInteractive();
      } catch (e) {
        await dialog.showMessageBox({
          type: 'info',
          title: shellStrings.dialogUpdateTitle,
          message: shellStrings.dialogUpdateBody,
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  app.setName(APP_DISPLAY_TITLE);
  if (process.platform === 'win32') {
    app.setAppUserModelId('app.oneearning.desktop');
  }

  registerIpcHandlers(app, () => mainWindow, () => serverManager);

  mainWindow = createMainWindow();
  setupShellUi();

  loadSplash(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  try {
    await bootstrapPaperclip(mainWindow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await dialog.showErrorBox('启动失败', msg);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverManager) {
      const port = serverManager.getEffectiveListenPort();
      mainWindow = createMainWindow();
      void mainWindow.loadURL(`http://127.0.0.1:${port}/`);
      mainWindow.once('ready-to-show', () => mainWindow?.show());
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await serverManager?.stop();
  serverManager = null;
  tray?.destroy();
  tray = null;
});
