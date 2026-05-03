import type { PaperclipFetchRequest, PaperclipFetchResult } from '@electron/shared/paperclip-ipc';

export interface OneEarningApi {
  /** 壳已挂载并注册 IPC 监听后调用，主进程再派发 paperclip-ready */
  signalShellReady?: () => void;
  onServerStatus?: (cb: (s: { message: string }) => void) => () => void;
  onPaperclipReady?: (cb: (p: { baseUrl: string }) => void) => () => void;
  paperclipFetch?: (req: PaperclipFetchRequest) => Promise<PaperclipFetchResult>;
  getPaperclipBaseUrl?: () => Promise<string>;
  openExternalSafe?: (url: string) => Promise<void>;
  getServiceLog?: () => Promise<string>;
  restartPaperclip?: () => Promise<void>;
  openDataDir?: () => void;
  checkUpdates?: () => Promise<void>;
  getDataDir?: () => Promise<string>;
}

declare global {
  interface Window {
    oneEarning?: OneEarningApi;
  }
}

export {};
