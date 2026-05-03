/**
 * 判断是否为本机 Paperclip Web UI（需注入中文），并排除 OneEarning 壳用的 Vite 开发地址。
 */
export function shouldApplyPaperclipZh(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    const vite = process.env.VITE_DEV_SERVER_URL;
    if (vite) {
      try {
        const v = new URL(vite);
        if (u.hostname === v.hostname && u.port === v.port) return false;
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return false;
  }
}
