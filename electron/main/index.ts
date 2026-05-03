/**
 * OneEarning — Electron 主进程：启动 Paperclip 子进程、主窗口、托盘与 IPC。
 */
import { app, BrowserWindow, dialog, Menu } from 'electron';
import { existsSync } from 'node:fs';
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
import {
  notifyPaperclipReadyAfterRestart,
  resetPaperclipReadyCoordinator,
  schedulePaperclipReadyNotify,
} from './paperclip-ready-coordinator.js';

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
  /** 与主 bundle 同目录解析；preload 产物为 index.cjs（见 vite preload entryFileNames） */
  const u = import.meta.url;
  if (typeof u === 'string' && u.startsWith('file:')) {
    try {
      const mainDir = dirname(fileURLToPath(u));
      const dir = join(mainDir, '..', 'preload');
      const cjs = join(dir, 'index.cjs');
      if (existsSync(cjs)) return cjs;
      const legacy = join(dir, 'index.js');
      if (existsSync(legacy)) return legacy;
    } catch {
      /* fall through */
    }
  }
  const root = join(app.getAppPath(), 'dist-electron', 'preload');
  const cjs = join(root, 'index.cjs');
  if (existsSync(cjs)) return cjs;
  const legacy = join(root, 'index.js');
  if (existsSync(legacy)) return legacy;
  return join(__dirname, '..', 'preload', 'index.cjs');
}

function createMainWindow(): BrowserWindow {
  const preload = preloadPath();
  if (!existsSync(preload)) {
    throw new Error(
      `未找到 preload 脚本：${preload}。请先执行包含 Electron preload 的构建（例如 pnpm run build 或 dev 下的 electron 插件构建）。`,
    );
  }
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: APP_DISPLAY_TITLE,
    ...windowIconOptions(),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  bindFixedWindowTitle(win);

  win.webContents.on('preload-error', (_event, preloadFile, error) => {
    console.error('[OneEarning] preload-error', preloadFile, error);
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
  const preload = preloadPath();
  if (!existsSync(preload)) {
    throw new Error(`未找到 preload 脚本：${preload}`);
  }
  const child = new BrowserWindow({
    width: route === 'service' ? 720 : 520,
    height: route === 'service' ? 540 : 420,
    title: APP_DISPLAY_TITLE,
    ...windowIconOptions(),
    webPreferences: {
      preload,
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
  resetPaperclipReadyCoordinator();
  const port = await getPort({ port: 38473 });
  serverManager = new PaperclipServerManager(app, port);

  const pushStatus = (line: string) => {
    if (!win.isDestroyed()) win.webContents.send('oneearning:server-status', { message: line });
  };

  await serverManager.start(pushStatus);
  /** 首次 embedded Postgres + 迁移可能较慢；端口也可能与 PORT 不一致（detectPort 换端口） */
  await waitForPaperclipHealth(() => serverManager!.getEffectiveListenPort(), {
    timeoutMs: 600_000,
    intervalMs: 500,
    getAbortReason: () => serverManager?.getStartupAbortReason() ?? null,
  });

  if (!win.isDestroyed()) {
    schedulePaperclipReadyNotify(win, () => serverManager);
  }
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
      mainWindow = createMainWindow();
      loadSplash(mainWindow);
      if (!mainWindow.isDestroyed()) {
        notifyPaperclipReadyAfterRestart(mainWindow, () => serverManager);
      }
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
