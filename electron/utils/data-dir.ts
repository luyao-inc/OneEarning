import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { App } from 'electron';

/** Paperclip CLI --data-dir：与 ~/.paperclip 隔离，落在应用 userData 下 */
export function getPaperclipDataDir(app: App): string {
  return join(app.getPath('userData'), 'paperclip');
}

/** 解析 paperclipai 包根目录（开发态用项目 cwd；打包态为 extraResources/paperclip） */
export function getPaperclipRoot(app: App): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'paperclip');
  }
  try {
    const require = createRequire(join(process.cwd(), 'package.json'));
    return dirname(require.resolve('paperclipai/package.json'));
  } catch {
    return join(process.cwd(), 'node_modules', 'paperclipai');
  }
}
