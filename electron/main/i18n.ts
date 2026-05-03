import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'electron';

export type ShellStrings = {
  appName: string;
  menuFile: string;
  menuEdit: string;
  menuView: string;
  menuWindow: string;
  menuHelp: string;
  menuQuit: string;
  menuReload: string;
  menuDevTools: string;
  menuMinimize: string;
  menuClose: string;
  menuAbout: string;
  menuService: string;
  menuSettings: string;
  menuCheckUpdates: string;
  trayShow: string;
  trayQuit: string;
  dialogUpdateTitle: string;
  dialogUpdateBody: string;
};

const defaults: ShellStrings = {
  appName: 'OneEarning',
  menuFile: '文件',
  menuEdit: '编辑',
  menuView: '视图',
  menuWindow: '窗口',
  menuHelp: '帮助',
  menuQuit: '退出',
  menuReload: '重新加载',
  menuDevTools: '开发者工具',
  menuMinimize: '最小化',
  menuClose: '关闭',
  menuAbout: '关于 OneEarning',
  menuService: '服务状态',
  menuSettings: '数据与存储',
  menuCheckUpdates: '检查更新',
  trayShow: '显示主窗口',
  trayQuit: '退出',
  dialogUpdateTitle: '更新',
  dialogUpdateBody: '检查完成。',
};

export function loadShellStrings(app: App): ShellStrings {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'locales', 'zh-CN', 'shell.json')]
    : [join(process.cwd(), 'locales', 'zh-CN', 'shell.json'), join(app.getAppPath(), 'locales', 'zh-CN', 'shell.json')];

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<ShellStrings>;
        return { ...defaults, ...raw };
      } catch {
        break;
      }
    }
  }
  return defaults;
}
