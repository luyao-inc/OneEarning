import { contextBridge, ipcRenderer } from 'electron';
import type { PaperclipFetchRequest, PaperclipFetchResult } from '../shared/paperclip-ipc.js';
import type { UpdateStatusPayload } from '../shared/update-ipc.js';

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
  openShellAux: (route: 'about' | 'service' | 'settings') =>
    ipcRenderer.invoke('oneearning:open-shell-aux', route) as Promise<void>,
  checkUpdates: () => ipcRenderer.invoke('oneearning:check-updates') as Promise<void>,
  getAppVersion: () => ipcRenderer.invoke('oneearning:get-app-version') as Promise<string>,
  downloadUpdate: () => ipcRenderer.invoke('oneearning:download-update') as Promise<void>,
  quitAndInstall: () => ipcRenderer.invoke('oneearning:quit-and-install') as Promise<void>,
  onUpdateStatus: (cb: (p: UpdateStatusPayload) => void) => {
    const fn = (_e: unknown, p: UpdateStatusPayload) => cb(p);
    ipcRenderer.on('oneearning:update-status', fn);
    return () => ipcRenderer.removeListener('oneearning:update-status', fn);
  },
  getDataDir: () => ipcRenderer.invoke('oneearning:get-data-dir') as Promise<string>,
  getSidecarLog: (name: string) =>
    ipcRenderer.invoke('oneearning:get-sidecar-log', name) as Promise<string>,
  openSidecarLogsDir: () => ipcRenderer.invoke('oneearning:open-sidecar-logs-dir') as Promise<void>,
  getKnowledgeSidecarDiagnostics: () =>
    ipcRenderer.invoke('oneearning:get-knowledge-sidecar-diagnostics') as Promise<{
      baseUrl: string | null;
      script: string | null;
      cwd: string | null;
      nodeExecutable: string | null;
      pid: number | undefined;
      lastExitCode: number | null;
      lastExitSignal: string | null;
    }>,
  stageClawhubSkillDirectory: (payload: {
    companyId: string;
    slugHint: string;
    files: { path: string; content: string }[];
  }) => ipcRenderer.invoke('oneearning:stage-clawhub-skill-directory', payload) as Promise<string>,
  knowledgeGetRoot: (payload: { companyId: string; agentId: string }) =>
    ipcRenderer.invoke('oneearning:knowledge-get-root', payload) as Promise<string>,
  knowledgeOpenDir: (payload: { companyId: string; agentId: string }) =>
    ipcRenderer.invoke('oneearning:knowledge-open-dir', payload) as Promise<void>,
  knowledgeListFiles: (payload: { companyId: string; agentId: string }) =>
    ipcRenderer.invoke('oneearning:knowledge-list-files', payload) as Promise<
      Array<{ relPath: string; size: number; mtimeMs: number }>
    >,
  knowledgeImportDialog: (payload: { companyId: string; agentId: string }) =>
    ipcRenderer.invoke('oneearning:knowledge-import-dialog', payload) as Promise<{ imported: string[] }>,
  knowledgeDeleteDiskFile: (payload: { companyId: string; agentId: string; relPath: string }) =>
    ipcRenderer.invoke('oneearning:knowledge-delete-disk-file', payload) as Promise<void>,
  knowledgeOpenFile: (payload: { companyId: string; agentId: string; relPath: string }) =>
    ipcRenderer.invoke('oneearning:knowledge-open-file', payload) as Promise<void>,
  outcomesOpenUrl: (url: string) => ipcRenderer.invoke('oneearning:outcomes-open-url', url) as Promise<void>,
  outcomesOpenPath: (path: string) =>
    ipcRenderer.invoke('oneearning:outcomes-open-path', { path }) as Promise<void>,
  outcomesRevealPath: (path: string) =>
    ipcRenderer.invoke('oneearning:outcomes-reveal-path', { path }) as Promise<void>,
});
