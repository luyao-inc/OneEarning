import { Menu, Tray, nativeImage, type App } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ShellStrings } from './i18n.js';
import { getAppIconPath } from './app-icon.js';

/** 16×16 占位图标（无 resources/icons/icon.png 时使用） */
const TRAY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVQ4T2NkGGDAiMRAImBiYGD4TykWBgYAc24BAftfQZ0AAAAASUVORK5CYII=';

function resolveTrayIcon(app: App): Electron.NativeImage {
  const mainIcon = getAppIconPath();
  if (mainIcon) {
    const img = nativeImage.createFromPath(mainIcon);
    if (!img.isEmpty()) return img;
  }
  const trayOnly = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'tray.png')
    : join(process.cwd(), 'resources', 'icons', 'tray.png');
  if (existsSync(trayOnly)) {
    const img = nativeImage.createFromPath(trayOnly);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_PNG}`);
}

export function createTray(
  app: App,
  shellStrings: ShellStrings,
  opts: {
    onShow: () => void;
    onQuit: () => void;
    onAbout: () => void;
    onService: () => void;
    onSettings: () => void;
    onCheckUpdates: () => Promise<void>;
  },
): Tray {
  const image = resolveTrayIcon(app);
  const tray = new Tray(image);

  const contextMenu = Menu.buildFromTemplate([
    { label: shellStrings.trayShow, click: opts.onShow },
    { type: 'separator' },
    { label: shellStrings.menuAbout, click: opts.onAbout },
    { label: shellStrings.menuService, click: opts.onService },
    { label: shellStrings.menuSettings, click: opts.onSettings },
    {
      label: shellStrings.menuCheckUpdates,
      click: async () => {
        try {
          await opts.onCheckUpdates();
        } catch {
          /* 与菜单版一致：错误由 updater 内部处理 */
        }
      },
    },
    { type: 'separator' },
    { label: shellStrings.trayQuit, click: opts.onQuit },
  ]);

  tray.setToolTip(shellStrings.appName);
  tray.setContextMenu(contextMenu);
  tray.on('click', opts.onShow);

  return tray;
}
