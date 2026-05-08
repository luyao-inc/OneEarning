import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App } from 'electron';

export type SidecarName = 'clawhub' | 'knowledge' | 'outcomes';

/**
 * 开发态：侧车为 `servers/<name>/dist/index.js`；打包态：extraResources 为 `resources/servers/<name>/index.js`。
 * 开发时若先执行了清理，需有 dist 或 predev 自动 tsc，否则返回 null。
 */
export function resolveSidecarEntryScript(app: App, name: SidecarName): string | null {
  const resources = process.resourcesPath;
  const packaged = join(resources, 'servers', name, 'index.js');
  if (existsSync(packaged)) {
    return packaged;
  }

  const rel = join('servers', name, 'dist', 'index.js');

  const fromAppPath = join(app.getAppPath(), rel);
  if (existsSync(fromAppPath)) {
    return fromAppPath;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const fromMain = join(here, '..', '..', rel);
  if (existsSync(fromMain)) {
    return fromMain;
  }

  const fromCwd = join(process.cwd(), rel);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  const initCwd = process.env.INIT_CWD;
  if (typeof initCwd === 'string' && initCwd.length > 0) {
    const fromInit = join(initCwd, rel);
    if (existsSync(fromInit)) {
      return fromInit;
    }
  }

  return null;
}
