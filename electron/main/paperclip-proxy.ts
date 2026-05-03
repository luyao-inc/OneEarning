/**
 * 将渲染进程的 Paperclip API 请求代理到本机 paperclip 进程（避免跨域）。
 */
import type { PaperclipFetchRequest, PaperclipFetchResult } from '../shared/paperclip-ipc.js';

export type { PaperclipFetchRequest, PaperclipFetchResult };

export function isAllowedPaperclipProxyPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || !path.startsWith('/')) return false;
  if (path.includes('..') || path.includes('\n') || path.includes('\r')) return false;
  return path.startsWith('/api/');
}

export async function paperclipProxyFetch(
  baseUrl: string,
  req: PaperclipFetchRequest,
): Promise<PaperclipFetchResult> {
  if (!isAllowedPaperclipProxyPath(req.path)) {
    return { ok: false, error: 'Path not allowed for Paperclip proxy' };
  }

  let parsed: URL;
  try {
    parsed = new URL(req.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  } catch {
    return { ok: false, error: 'Invalid base URL or path' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Invalid URL protocol' };
  }

  const host = parsed.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return { ok: false, error: 'Host must be loopback' };
  }

  const method = (req.method ?? 'GET').toUpperCase();
  const timeoutMs = typeof req.timeoutMs === 'number' && req.timeoutMs > 0 ? req.timeoutMs : 60_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers({ ...(req.headers ?? {}) });
    const body = req.body === undefined || req.body === null ? undefined : req.body;
    if (body !== undefined && !headers.has('Content-Type') && !headers.has('content-type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(parsed.toString(), {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type');
    const ct = contentType?.toLowerCase() ?? '';

    if (response.status === 204) {
      return { ok: true, status: 204, contentType };
    }

    if (ct.includes('application/json')) {
      const text = await response.text();
      let json: unknown;
      try {
        json = text.length ? JSON.parse(text) : undefined;
      } catch {
        return { ok: true, status: response.status, contentType, text };
      }
      return { ok: true, status: response.status, contentType, json };
    }

    const text = await response.text();
    return { ok: true, status: response.status, contentType, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('abort')) {
      return { ok: false, error: 'Request timed out' };
    }
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
