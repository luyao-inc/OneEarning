import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** 开发态与打包后（extraResources → resources/icons）的窗口/托盘图标路径 */
export function getAppIconPngPath(): string | undefined {
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'icons', 'icon.png'));
  }
  candidates.push(join(process.cwd(), 'resources', 'icons', 'icon.png'));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}
