import { contextBridge, ipcRenderer } from 'electron';
import { initZhInjector, type DictFile } from './zh-injector.js';
import paperclipDict from '../../locales/zh-CN/paperclip.json';

// #region agent log
fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
  body: JSON.stringify({
    sessionId: 'e36b4c',
    hypothesisId: 'H10-preload-executed',
    location: 'electron/preload/index.ts:top',
    message: 'preload script run',
    data: { href: String(window.location.href).slice(0, 160) },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

/** 与主进程 shouldApplyPaperclipZh 对齐：本机 Paperclip，排除壳 Vite（vite.config strictPort） */
function isPaperclipPageForZhInject(): boolean {
  try {
    const u = new URL(window.location.href);
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    if (u.port === '5174') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 在 preload 隔离上下文中直接改 document（与主世界 `window.oneEarning` 无关）。
 * 主进程 `executeJavaScript` 调页面上的 bridge 仍可能拿不到暴露对象；故 Paperclip 以「每次 preload 执行完」自调度为主路径。
 */
function applyPaperclipZhFromPreload(): void {
  const h = window.location.hostname;
  // #region agent log
  fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
    body: JSON.stringify({
      sessionId: 'e36b4c',
      hypothesisId: 'POST-FIX-bridge-entry',
      location: 'electron/preload/index.ts:applyPaperclipZhFromPreload',
      message: 'bridge applyPaperclipZh',
      data: { hostname: h, href: String(window.location.href).slice(0, 160) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (h !== '127.0.0.1' && h !== 'localhost') {
    // #region agent log
    fetch('http://127.0.0.1:7825/ingest/9932c026-1433-4100-9dfe-a1910d6fb174', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e36b4c' },
      body: JSON.stringify({
        sessionId: 'e36b4c',
        hypothesisId: 'H4-hostname-blocked',
        location: 'electron/preload/index.ts:applyPaperclipZhFromPreload',
        message: 'skipped initZhInjector (hostname)',
        data: { hostname: h },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return;
  }
  initZhInjector(paperclipDict as DictFile);
}

contextBridge.exposeInMainWorld('oneEarning', {
  applyPaperclipZh: applyPaperclipZhFromPreload,
  onServerStatus: (cb: (s: { message: string }) => void) => {
    const fn = (_e: unknown, s: { message: string }) => cb(s);
    ipcRenderer.on('oneearning:server-status', fn);
    return () => ipcRenderer.removeListener('oneearning:server-status', fn);
  },
  getServiceLog: () => ipcRenderer.invoke('oneearning:get-service-log') as Promise<string>,
  restartPaperclip: () => ipcRenderer.invoke('oneearning:restart-paperclip') as Promise<void>,
  openDataDir: () => {
    ipcRenderer.send('oneearning:open-data-dir');
  },
  checkUpdates: () => ipcRenderer.invoke('oneearning:check-updates') as Promise<void>,
  getDataDir: () => ipcRenderer.invoke('oneearning:get-data-dir') as Promise<string>,
});

function schedulePaperclipZhIfNeeded(): void {
  if (!isPaperclipPageForZhInject()) return;
  const run = () => applyPaperclipZhFromPreload();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => run(), { once: true });
  } else {
    queueMicrotask(run);
  }
}

schedulePaperclipZhIfNeeded();
