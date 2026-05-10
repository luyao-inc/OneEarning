import { BrowserWindow, App, dialog } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatusPayload } from '../shared/update-ipc.js';

/** electron-updater 为 CJS，在 ESM 主进程里需从 default 再解构 */
const { autoUpdater } = electronUpdater;

let feedConfigured = false;
let listenersRegistered = false;
let appRef: App | null = null;
/** 托盘等路径：检查完成后用对话框提示 */
let pendingNotifyDialog = false;

function isDev(): boolean {
  return Boolean(process.env.VITE_DEV_SERVER_URL);
}

function updatesEnabled(): boolean {
  if (isDev()) return false;
  if (appRef?.isPackaged) return true;
  return Boolean(process.env.ONEEARNING_UPDATE_URL?.trim());
}

function currentVersion(): string {
  return appRef?.getVersion() ?? '0.0.0';
}

function broadcast(status: UpdateStatusPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('oneearning:update-status', status);
    }
  }
}

function ensureFeed(): void {
  if (feedConfigured) return;
  feedConfigured = true;
  try {
    const override = process.env.ONEEARNING_UPDATE_URL?.trim();
    if (override) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: override,
      });
    }
    /** 无覆盖时：打包应用使用 electron-builder 写入的 app-update.yml（与本文件 publish.github 一致） */
  } catch {
    /* ignore */
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
}

function registerListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  autoUpdater.on('checking-for-update', () => {
    broadcast({
      phase: 'checking',
      currentVersion: currentVersion(),
    });
  });

  autoUpdater.on('update-available', (info) => {
    const availableVersion =
      typeof info?.version === 'string' ? info.version : undefined;
    const releaseNotes =
      typeof info?.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info?.releaseNotes)
          ? info.releaseNotes.map((n) => String(n)).join('\n')
          : undefined;

    broadcast({
      phase: 'available',
      currentVersion: currentVersion(),
      availableVersion,
      releaseNotes,
    });

    if (pendingNotifyDialog) {
      pendingNotifyDialog = false;
      void dialog.showMessageBox({
        type: 'info',
        title: '检查更新',
        message: availableVersion
          ? `发现新版本：${availableVersion}。可在关于页面下载并重启安装。`
          : '发现新版本。可在关于页面下载并重启安装。',
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    broadcast({
      phase: 'not-available',
      currentVersion: currentVersion(),
    });
    if (pendingNotifyDialog) {
      pendingNotifyDialog = false;
      void dialog.showMessageBox({
        type: 'info',
        title: '检查更新',
        message: '当前已是最新版本。',
      });
    }
  });

  autoUpdater.on('error', (err) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    broadcast({
      phase: 'error',
      currentVersion: currentVersion(),
      errorMessage,
    });
    if (pendingNotifyDialog) {
      pendingNotifyDialog = false;
      void dialog.showMessageBox({
        type: 'warning',
        title: '检查更新',
        message: '检查更新失败',
        detail: errorMessage,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      phase: 'downloading',
      currentVersion: currentVersion(),
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const v =
      info && typeof (info as { version?: string }).version === 'string'
        ? (info as { version: string }).version
        : undefined;
    broadcast({
      phase: 'downloaded',
      currentVersion: currentVersion(),
      availableVersion: v,
    });
  });
}

/**
 * 主进程启动时调用一次：配置 feed、注册 autoUpdater 事件。
 */
export function initUpdater(app: App): void {
  appRef = app;
  ensureFeed();
  registerListeners();
  broadcast({ phase: 'idle', currentVersion: currentVersion() });
}

/**
 * 打包环境下延迟静默检查；失败仅广播 error，不弹阻塞对话框。
 */
export function scheduleSilentStartupCheck(): void {
  if (!updatesEnabled()) return;
  setTimeout(() => {
    void checkForUpdates({ notifyDialog: false }).catch((e) => {
      console.error('[OneEarning] silent update check failed', e);
    });
  }, 8000);
}

export async function checkForUpdates(options?: { notifyDialog?: boolean }): Promise<void> {
  if (!updatesEnabled()) {
    broadcast({
      phase: 'not-available',
      currentVersion: currentVersion(),
      errorMessage: isDev()
        ? '开发模式下不检查更新。'
        : '当前运行方式不支持在线更新；设置 ONEEARNING_UPDATE_URL 可指定更新源。',
    });
    if (options?.notifyDialog) {
      await dialog.showMessageBox({
        type: 'info',
        title: '检查更新',
        message: isDev()
          ? '开发模式下不检查更新。'
          : '当前安装不支持在线更新。正式发布版将从 GitHub Releases 检查更新。',
      });
    }
    return;
  }
  ensureFeed();
  pendingNotifyDialog = options?.notifyDialog ?? false;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    pendingNotifyDialog = false;
    const errorMessage = e instanceof Error ? e.message : String(e);
    broadcast({
      phase: 'error',
      currentVersion: currentVersion(),
      errorMessage,
    });
    if (options?.notifyDialog) {
      await dialog.showMessageBox({
        type: 'warning',
        title: '检查更新',
        message: '检查更新失败',
        detail: errorMessage,
      });
    }
    throw e;
  }
}

/** 托盘 / 主进程菜单：检查完成后可能弹出系统对话框 */
export async function checkForUpdatesInteractive(): Promise<void> {
  await checkForUpdates({ notifyDialog: true });
}

export async function downloadPendingUpdate(): Promise<void> {
  if (!updatesEnabled()) return;
  ensureFeed();
  await autoUpdater.downloadUpdate();
}

export function quitAndInstallNow(): void {
  if (!updatesEnabled()) return;
  autoUpdater.quitAndInstall(false, true);
}
