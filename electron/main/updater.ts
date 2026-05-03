import { dialog } from 'electron';
import electronUpdater from 'electron-updater';

/** electron-updater 为 CJS，在 ESM 主进程里需从 default 再解构 */
const { autoUpdater } = electronUpdater;

let feedConfigured = false;

function ensureFeed(): void {
  if (feedConfigured) return;
  feedConfigured = true;
  try {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: process.env.ONEEARNING_UPDATE_URL || 'https://example.invalid/oneearning-updates',
    });
  } catch {
    /* ignore */
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
}

export async function checkForUpdatesInteractive(): Promise<void> {
  ensureFeed();
  try {
    const result = await autoUpdater.checkForUpdates();
    await dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: result?.updateInfo?.version
        ? `发现新版本：${result.updateInfo.version}`
        : '当前已是最新版本（或未配置更新源）。',
    });
  } catch (e) {
    await dialog.showMessageBox({
      type: 'warning',
      title: '检查更新',
      message: '检查更新失败',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
