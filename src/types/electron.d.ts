import type { PaperclipFetchRequest, PaperclipFetchResult } from '@electron/shared/paperclip-ipc';
import type { UpdateStatusPayload } from '@electron/shared/update-ipc';

export type { UpdateStatusPayload };

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
  /** 打开壳层小窗：关于 / 服务状态 / 数据与存储（与托盘菜单一致） */
  openShellAux?: (route: 'about' | 'service' | 'settings') => Promise<void>;
  checkUpdates?: () => Promise<void>;
  getAppVersion?: () => Promise<string>;
  downloadUpdate?: () => Promise<void>;
  quitAndInstall?: () => Promise<void>;
  onUpdateStatus?: (cb: (p: UpdateStatusPayload) => void) => () => void;
  getDataDir?: () => Promise<string>;
  /** 侧车日志尾部（用户数据目录 logs/sidecars/<name>.log） */
  getSidecarLog?: (name: string) => Promise<string>;
  /** 打开用户数据目录下的 logs/sidecars（与「打开数据目录」的 paperclip 子目录不同） */
  openSidecarLogsDir?: () => Promise<void>;
  getKnowledgeSidecarDiagnostics?: () => Promise<{
    baseUrl: string | null;
    script: string | null;
    cwd: string | null;
    nodeExecutable: string | null;
    pid: number | undefined;
    lastExitCode: number | null;
    lastExitSignal: string | null;
  }>;
  /** 将多文件技能写入本机数据目录，返回绝对路径供 importFromSource 使用 */
  stageClawhubSkillDirectory?: (payload: {
    companyId: string;
    slugHint: string;
    files: { path: string; content: string }[];
  }) => Promise<string>;
  knowledgeGetRoot?: (payload: { companyId: string; agentId: string }) => Promise<string>;
  knowledgeOpenDir?: (payload: { companyId: string; agentId: string }) => Promise<void>;
  knowledgeListFiles?: (payload: {
    companyId: string;
    agentId: string;
  }) => Promise<Array<{ relPath: string; size: number; mtimeMs: number }>>;
  knowledgeImportDialog?: (payload: { companyId: string; agentId: string }) => Promise<{ imported: string[] }>;
  knowledgeDeleteDiskFile?: (payload: {
    companyId: string;
    agentId: string;
    relPath: string;
  }) => Promise<void>;
  /** 使用系统默认程序打开知识库目录下的文件 */
  knowledgeOpenFile?: (payload: { companyId: string; agentId: string; relPath: string }) => Promise<void>;
  /** 系统浏览器打开 http(s) 链接（成果等） */
  outcomesOpenUrl?: (url: string) => Promise<void>;
  /** 打开绝对路径文件或目录（Windows 本地路径 / UNC） */
  outcomesOpenPath?: (path: string) => Promise<void>;
  /** 在资源管理器中定位文件或文件夹 */
  outcomesRevealPath?: (path: string) => Promise<void>;
}

declare global {
  interface Window {
    oneEarning?: OneEarningApi;
  }
}

export {};
