import { Menu, type BrowserWindow, shell, dialog, app } from 'electron';
import type { ShellStrings } from './i18n.js';

export function buildAppMenu(shellStrings: ShellStrings, opts: {
  mainWindow: BrowserWindow | null; // 预留：未来绑定到主窗口快捷键
  isDev: boolean;
  onAbout: () => void;
  onService: () => void;
  onSettings: () => void;
  onCheckUpdates: () => Promise<void>;
}): Menu {
  const { mainWindow: _mw, isDev, onAbout, onService, onSettings, onCheckUpdates } = opts;
  void _mw;

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (process.platform !== 'darwin') {
    template.push({
      label: shellStrings.menuFile,
      submenu: [
        {
          label: shellStrings.menuQuit,
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    });
  }

  template.push(
    {
      label: shellStrings.menuEdit,
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
      ],
    },
    {
      label: shellStrings.menuView,
      submenu: [
        ...(isDev
          ? ([
              { label: shellStrings.menuReload, role: 'reload' as const },
              { label: shellStrings.menuDevTools, role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ] satisfies Electron.MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
      ],
    },
    {
      label: shellStrings.menuWindow,
      submenu: [{ role: 'minimize', label: shellStrings.menuMinimize }, { role: 'close', label: shellStrings.menuClose }],
    },
    {
      label: shellStrings.menuHelp,
      submenu: [
        { label: shellStrings.menuAbout, click: onAbout },
        { label: shellStrings.menuService, click: onService },
        { label: shellStrings.menuSettings, click: onSettings },
        { type: 'separator' },
        {
          label: shellStrings.menuCheckUpdates,
          click: async () => {
            try {
              await onCheckUpdates();
            } catch (e) {
              await dialog.showMessageBox({
                type: 'info',
                title: shellStrings.dialogUpdateTitle,
                message: shellStrings.dialogUpdateBody,
                detail: e instanceof Error ? e.message : String(e),
              });
            }
          },
        },
        {
          label: 'Paperclip 文档',
          click: () => void shell.openExternal('https://paperclip.ing/docs'),
        },
      ],
    },
  );

  if (process.platform === 'darwin') {
    template.unshift({
      label: shellStrings.appName,
      submenu: [
        { label: shellStrings.menuAbout, click: onAbout },
        { type: 'separator' },
        { label: shellStrings.menuQuit, accelerator: 'Command+Q', click: () => app.quit() },
      ],
    });
  }

  return Menu.buildFromTemplate(template);
}

export function setAppMenu(shellStrings: ShellStrings, opts: Parameters<typeof buildAppMenu>[1]): void {
  Menu.setApplicationMenu(buildAppMenu(shellStrings, opts));
}
