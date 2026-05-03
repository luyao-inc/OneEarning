export type PaperclipFormPart = {
  name: string;
  filename?: string;
  type?: string;
  /** Base64-encoded bytes (file or text field UTF-8) */
  dataBase64: string;
};

export type PaperclipFetchRequest = {
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  /** When set, main process builds multipart/form-data (overrides body). */
  formParts?: PaperclipFormPart[];
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
