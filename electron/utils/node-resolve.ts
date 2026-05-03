import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'electron';

/**
 * 运行 paperclipai 必须使用与安装时 ABI 一致的 Node（系统 Node 或 resources 内捆绑 Node），
 * 不要使用 Electron 自带的 Node 跑带 native 模块的依赖树。
 */
export function resolveNodeExecutable(app: App): string {
  const env = process.env.ONEEARNING_NODE?.trim();
  if (env && existsSync(env)) return env;

  const plat = process.platform;
  const arch = process.arch;
  const base = join(process.resourcesPath, 'bin', `${plat}-${arch}`);
  const win = plat === 'win32';
  const candidate = join(base, win ? 'node.exe' : 'node');
  if (app.isPackaged && existsSync(candidate)) return candidate;

  return win ? 'node.exe' : 'node';
}
