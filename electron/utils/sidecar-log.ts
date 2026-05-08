import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { App } from 'electron';

export function getSidecarLogPath(app: App, name: string): string {
  const dir = join(app.getPath('userData'), 'logs', 'sidecars');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}.log`);
}

/** 生产环境侧车 silent 时 stderr 不落控制台，写入此文件便于排查。 */
export function appendSidecarLine(app: App, name: string, line: string): void {
  try {
    const p = getSidecarLogPath(app, name);
    const ts = new Date().toISOString();
    appendFileSync(p, `[${ts}] ${line}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

export async function readSidecarLogTail(app: App, name: string, maxBytes: number): Promise<string> {
  const p = getSidecarLogPath(app, name);
  if (!existsSync(p)) {
    return '';
  }
  const st = await stat(p);
  const fh = await open(p, 'r');
  try {
    const start = st.size > maxBytes ? st.size - maxBytes : 0;
    const len = st.size - start;
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    let text = buf.toString('utf8');
    if (start > 0) {
      text = `…(仅末尾 ${maxBytes} 字节)\n${text}`;
    }
    return text;
  } finally {
    await fh.close();
  }
}
