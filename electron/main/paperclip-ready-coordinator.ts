import { setImmediate } from 'node:timers';
import type { BrowserWindow } from 'electron';
import type { PaperclipServerManager } from './server-manager.js';

type Ctx = { win: BrowserWindow; getMgr: () => PaperclipServerManager | null };

let pending: Ctx | null = null;
let shellSignaled = false;

export function resetPaperclipReadyCoordinator(): void {
  pending = null;
  shellSignaled = false;
}

/**
 * 渲染进程在注册好 `onPaperclipReady` 后发送，主进程再发 `paperclip-ready`，避免早于 React 订阅。
 */
export function onRendererShellReady(_win: BrowserWindow): void {
  void _win;
  shellSignaled = true;
  tryFlushPaperclipReady();
}

/** bootstrap 结束：等 shell-ready 与之一同 tryFlush */
export function schedulePaperclipReadyNotify(win: BrowserWindow, getMgr: () => PaperclipServerManager | null): void {
  pending = { win, getMgr };

  /** 若 preload 未发 shell-ready（或 IPC 校验失败），在文档就绪后再视为 shell 已就绪 */
  const shellFallback = (): void => {
    if (!pending || pending.win !== win) return;
    if (shellSignaled) return;
    onRendererShellReady(win);
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', shellFallback);
  } else {
    setImmediate(shellFallback);
  }

  tryFlushPaperclipReady();
}

/** 壳已确定在跑（重启 / macOS activate 新窗）：不等 shell IPC */
export function notifyPaperclipReadyAfterRestart(win: BrowserWindow, getMgr: () => PaperclipServerManager | null): void {
  shellSignaled = true;
  pending = { win, getMgr };
  tryFlushPaperclipReady();
}

function tryFlushPaperclipReady(): void {
  if (!pending || !shellSignaled) return;
  const ctx = pending;
  if (ctx.win.isDestroyed()) {
    pending = null;
    shellSignaled = false;
    return;
  }
  const mgr = ctx.getMgr();
  if (!mgr) {
    return;
  }
  const port = mgr.getEffectiveListenPort();
  if (!Number.isFinite(port) || port <= 0) return;
  const baseUrl = `http://127.0.0.1:${port}`;
  ctx.win.webContents.send('oneearning:paperclip-ready', { baseUrl });
  pending = null;
  shellSignaled = false;
}
