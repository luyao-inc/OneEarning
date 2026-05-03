export interface OneEarningApi {
  onServerStatus?: (cb: (s: { message: string }) => void) => () => void;
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
