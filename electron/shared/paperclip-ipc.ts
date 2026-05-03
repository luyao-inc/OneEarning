export type PaperclipFetchRequest = {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutMs?: number;
};

export type PaperclipFetchResult =
  | {
      ok: true;
      status: number;
      contentType: string | null;
      json?: unknown;
      text?: string;
    }
  | { ok: false; error: string };
