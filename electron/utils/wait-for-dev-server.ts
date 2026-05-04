import { get } from 'node:http';

/**
 * Electron 在 Chromium 网络子进程刚崩溃重启时，可能对 127.0.0.1:5174 的首包 loadURL 返回 ERR_FAILED。
 * 在发起 loadURL 前先等到本机 Vite 能建立 HTTP 连接，可显著降低该竞态。
 */
export function waitForDevServerReachable(baseUrl: string, maxMs = 45_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`timeout waiting for dev server: ${baseUrl}`));
        return;
      }
      const req = get(baseUrl, { timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        setImmediate(tick);
      });
      req.on('timeout', () => {
        req.destroy();
        setImmediate(tick);
      });
    };
    tick();
  });
}
