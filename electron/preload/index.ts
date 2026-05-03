import { contextBridge, ipcRenderer } from 'electron';
import type { PaperclipFetchRequest, PaperclipFetchResult } from '../shared/paperclip-ipc.js';

type PaperclipReadyPayload = { baseUrl: string };
const paperclipReadyCallbacks = new Set<(p: PaperclipReadyPayload) => void>();
let lastPaperclipReady: PaperclipReadyPayload | null = null;

function emitPaperclipReady(p: PaperclipReadyPayload): void {
  lastPaperclipReady = p;
  for (const cb of paperclipReadyCallbacks) {
    try {
      cb(p);
    } catch {
      /* ignore */
    }
  }
}

ipcRenderer.on('oneearning:paperclip-ready', (_e, p: PaperclipReadyPayload) => {
  emitPaperclipReady(p);
});

contextBridge.exposeInMainWorld('oneEarning', {
  signalShellReady: () => {
    ipcRenderer.send('oneearning:shell-ready');
  },
  onServerStatus: (cb: (s: { message: string }) => void) => {
    const fn = (_e: unknown, s: { message: string }) => cb(s);
    ipcRenderer.on('oneearning:server-status', fn);
    return () => ipcRenderer.removeListener('oneearning:server-status', fn);
  },
  onPaperclipReady: (cb: (p: PaperclipReadyPayload) => void) => {
    paperclipReadyCallbacks.add(cb);
    if (lastPaperclipReady) {
      queueMicrotask(() => {
        cb(lastPaperclipReady!);
      });
    }
    return () => {
      paperclipReadyCallbacks.delete(cb);
    };
  },
  paperclipFetch: (req: PaperclipFetchRequest) =>
    ipcRenderer.invoke('oneearning:paperclip-fetch', req) as Promise<PaperclipFetchResult>,
  getPaperclipBaseUrl: () => ipcRenderer.invoke('oneearning:get-paperclip-base-url') as Promise<string>,
  openExternalSafe: (url: string) => ipcRenderer.invoke('oneearning:open-external-safe', url) as Promise<void>,
  getServiceLog: () => ipcRenderer.invoke('oneearning:get-service-log') as Promise<string>,
  restartPaperclip: () => ipcRenderer.invoke('oneearning:restart-paperclip') as Promise<void>,
  openDataDir: () => {
    ipcRenderer.send('oneearning:open-data-dir');
  },
  checkUpdates: () => ipcRenderer.invoke('oneearning:check-updates') as Promise<void>,
  getDataDir: () => ipcRenderer.invoke('oneearning:get-data-dir') as Promise<string>,
});
