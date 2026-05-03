import type { PaperclipFetchResult } from '@electron/shared/paperclip-ipc';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getBridge() {
  const w = window.oneEarning;
  if (!w?.paperclipFetch) {
    throw new Error('Paperclip bridge unavailable');
  }
  return w;
}

function parseJsonError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string') {
      return (e as { message: string }).message;
    }
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

async function parseResponse<T>(r: PaperclipFetchResult): Promise<T> {
  if (!r.ok) {
    throw new Error(r.error);
  }
  if (r.status === 204 || r.status === 304) {
    return undefined as T;
  }
  if (r.status >= 400) {
    const body = r.json ?? r.text;
    throw new ApiError(parseJsonError(r.json ?? r.text), r.status, body);
  }
  if (r.json !== undefined) {
    return r.json as T;
  }
  throw new ApiError('Unexpected empty response', r.status, null);
}

function toApiPath(path: string): string {
  if (path.startsWith('/api/')) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `/api${p}`;
}

async function request<T>(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string | null } = {},
): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const r = await getBridge().paperclipFetch!({
    path: toApiPath(path),
    method,
    headers: { Accept: 'application/json', ...opts.headers },
    body: method === 'GET' || method === 'HEAD' ? undefined : opts.body ?? undefined,
    timeoutMs: 120_000,
  });

  return parseResponse<T>(r);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
