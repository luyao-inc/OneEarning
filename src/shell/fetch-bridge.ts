import type { PaperclipFetchRequest, PaperclipFetchResult, PaperclipFormPart } from '@electron/shared/paperclip-ipc';

const nativeFetch = window.fetch.bind(window);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function formDataToParts(form: FormData): Promise<PaperclipFormPart[]> {
  const parts: PaperclipFormPart[] = [];
  for (const [name, value] of form.entries()) {
    if (value instanceof File) {
      const ab = await value.arrayBuffer();
      parts.push({
        name,
        filename: value.name,
        type: value.type || undefined,
        dataBase64: arrayBufferToBase64(ab),
      });
    } else {
      const enc = new TextEncoder().encode(String(value));
      parts.push({
        name,
        dataBase64: arrayBufferToBase64(enc.buffer),
      });
    }
  }
  return parts;
}

function paperclipResultToResponse(r: PaperclipFetchResult): Response {
  if (!r.ok) {
    return new Response(JSON.stringify({ error: r.error }), {
      status: 503,
      statusText: 'OneEarning proxy error',
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (r.status === 204) {
    return new Response(null, { status: 204 });
  }
  const ct = r.contentType ?? 'application/octet-stream';
  if (r.json !== undefined) {
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(r.text ?? '', {
    status: r.status,
    headers: { 'Content-Type': ct },
  });
}

function shouldProxyApi(url: URL): boolean {
  if (!url.pathname.startsWith('/api/')) return false;
  const h = url.hostname;
  if (url.protocol === 'about:') return false;
  if (url.protocol === 'file:') return true;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h === window.location.hostname) return true;
  return false;
}

function toApiPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function headersFromRequest(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return headers;
}

export function installPaperclipFetchBridge(): void {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url, window.location.href);

    const bridge = window.oneEarning?.paperclipFetch;
    if (!bridge || !shouldProxyApi(url)) {
      return nativeFetch(input, init);
    }

    const path = toApiPath(url);
    const method = (init?.method ?? req.method ?? 'GET').toUpperCase();
    const headers = headersFromRequest(req);

    let body: string | null | undefined;
    let formParts: PaperclipFormPart[] | undefined;

    if (method !== 'GET' && method !== 'HEAD') {
      const raw = init?.body;
      if (raw instanceof FormData) {
        formParts = await formDataToParts(raw);
      } else if (typeof raw === 'string') {
        body = raw;
      } else {
        const ct = (req.headers.get('content-type') ?? '').toLowerCase();
        if (ct.includes('multipart/form-data')) {
          const fd = await req.formData();
          formParts = await formDataToParts(fd);
        } else {
          body = await req.text();
        }
      }
    }

    const pcReq: PaperclipFetchRequest = {
      path,
      method,
      headers,
      body: formParts?.length ? null : body ?? null,
      formParts: formParts?.length ? formParts : undefined,
      timeoutMs: 120_000,
    };

    const r = await bridge(pcReq);
    return paperclipResultToResponse(r);
  };
}
