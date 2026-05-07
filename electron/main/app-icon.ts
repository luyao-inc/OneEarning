import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function iconSearchDirs(): string[] {
  if (app.isPackaged) {
    return [join(process.resourcesPath, 'icons')];
  }
  return [join(process.cwd(), 'resources', 'icons')];
}

/**
 * Window / 托盘图标路径（PNG 优先；仅有 macOS .icns 时也可用，Electron nativeImage 支持）。
 * 打包后 extraResources 会把 `resources/icons` 拷到 `Contents/Resources/icons/`。
 */
export function getAppIconPath(): string | undefined {
  for (const dir of iconSearchDirs()) {
    const png = join(dir, 'icon.png');
    if (existsSync(png)) return png;
    const icns = join(dir, 'icon.icns');
    if (existsSync(icns)) return icns;
  }
  return undefined;
}

/** @deprecated 使用 getAppIconPath（返回值可能是 .icns） */
export function getAppIconPngPath(): string | undefined {
  return getAppIconPath();
}
