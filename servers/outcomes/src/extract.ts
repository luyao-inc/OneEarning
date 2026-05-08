export type OutcomeKind = "url" | "local_path" | "work_product";

export type DisplayKindName = "link" | "image" | "video" | "document" | "file";

export interface ExtractedCandidate {
  kind: OutcomeKind;
  canonical: string;
  title: string | null;
  snippet: string;
  workProductType: string | null;
}

const MAX_SNIPPET = 240;

function clipSnippet(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_SNIPPET) return t;
  return `${t.slice(0, MAX_SNIPPET)}…`;
}

/** Strip trailing punctuation commonly pasted after URLs */
function trimUrlTrail(url: string): string {
  return url.replace(/[),.;>\]}"'\]]+$/u, "");
}

export function normalizeHttpUrl(raw: string): string | null {
  let u = raw.trim();
  if (!u.length) return null;
  if (/^www\./i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function normalizeLocalPath(raw: string): string | null {
  let s = raw.trim();
  if (!s.length) return null;
  s = s.replace(/^["'`]+|["'`]+$/g, "");
  // UNC
  if (s.startsWith("\\\\")) {
    const cleaned = s.replace(/\//g, "\\");
    if (cleaned.includes("..")) return null;
    return cleaned;
  }
  const winAbs = /^[A-Za-z]:[/\\]/.test(s);
  if (!winAbs) return null;
  let norm = s.replace(/\//g, "\\");
  if (norm.includes("..")) return null;
  norm = norm.replace(/\\+$/g, "");
  return norm;
}

/**
 * Heuristic classification for UI (image / video / link / file).
 */
export function classifyDisplay(canonical: string, kind: OutcomeKind): DisplayKindName {
  if (kind === "url" || kind === "work_product") {
    const lower = canonical.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(lower)) return "image";
    if (/\.(mp4|webm|mov|mkv|avi)(\?|$)/i.test(lower)) return "video";
    if (/youtube\.com|youtu\.be|vimeo\.com|bilibili\.com/i.test(lower)) return "video";
    return "link";
  }
  const lower = canonical.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(lower)) return "image";
  if (/\.(mp4|webm|mov|mkv|avi)$/i.test(lower)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|zip)$/i.test(lower)) return "document";
  return "file";
}

function extractUrlsFromText(text: string, sink: ExtractedCandidate[], seen: Set<string>) {
  const mdLink = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(text)) !== null) {
    const label = m[1]?.trim() ?? "";
    const href = trimUrlTrail(m[2] ?? "");
    const norm = normalizeHttpUrl(href);
    if (!norm || seen.has(`url:${norm}`)) continue;
    seen.add(`url:${norm}`);
    sink.push({
      kind: "url",
      canonical: norm,
      title: label.length ? label : null,
      snippet: clipSnippet(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)),
      workProductType: null,
    });
  }

  const bareUrl = /https?:\/\/[^\s\])>'"<]+/gi;
  while ((m = bareUrl.exec(text)) !== null) {
    const norm = normalizeHttpUrl(trimUrlTrail(m[0]));
    if (!norm || seen.has(`url:${norm}`)) continue;
    seen.add(`url:${norm}`);
    sink.push({
      kind: "url",
      canonical: norm,
      title: null,
      snippet: clipSnippet(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)),
      workProductType: null,
    });
  }

  const wwwUrl = /\bwww\.[a-zA-Z0-9][-a-zA-Z0-9._]*\.[a-zA-Z]{2,}[^\s\])>'"<]*/gi;
  while ((m = wwwUrl.exec(text)) !== null) {
    const norm = normalizeHttpUrl(trimUrlTrail(m[0]));
    if (!norm || seen.has(`url:${norm}`)) continue;
    seen.add(`url:${norm}`);
    sink.push({
      kind: "url",
      canonical: norm,
      title: null,
      snippet: clipSnippet(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)),
      workProductType: null,
    });
  }
}

function extractPathsFromText(text: string, sink: ExtractedCandidate[], seen: Set<string>) {
  const unc = /\\\\[^\s'"<>|]+/g;
  let m: RegExpExecArray | null;
  while ((m = unc.exec(text)) !== null) {
    const norm = normalizeLocalPath(m[0]);
    if (!norm || seen.has(`path:${norm.toLowerCase()}`)) continue;
    seen.add(`path:${norm.toLowerCase()}`);
    sink.push({
      kind: "local_path",
      canonical: norm,
      title: null,
      snippet: clipSnippet(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)),
      workProductType: null,
    });
  }

  const winDrive = /[A-Za-z]:\\(?:[^\\/:*?"<>|\x00-\x1f\r\n]+\\)*[^\\/:*?"<>|\x00-\x1f\r\n]*/g;
  while ((m = winDrive.exec(text)) !== null) {
    const norm = normalizeLocalPath(m[0]);
    if (!norm || seen.has(`path:${norm.toLowerCase()}`)) continue;
    seen.add(`path:${norm.toLowerCase()}`);
    sink.push({
      kind: "local_path",
      canonical: norm,
      title: null,
      snippet: clipSnippet(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)),
      workProductType: null,
    });
  }
}

export function extractFromText(text: string): ExtractedCandidate[] {
  if (!text?.trim()) return [];
  const sink: ExtractedCandidate[] = [];
  const seen = new Set<string>();
  extractUrlsFromText(text, sink, seen);
  extractPathsFromText(text, sink, seen);
  return sink;
}

export function mergeStructuredHints(
  hints: Array<{ url?: string; title?: string; type?: string } | null | undefined>,
  seen: Set<string>,
): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  for (const h of hints) {
    if (!h?.url?.trim()) continue;
    const norm = normalizeHttpUrl(h.url.trim());
    if (!norm) continue;
    const key = `wp:${norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: "work_product",
      canonical: norm,
      title: h.title?.trim() || null,
      snippet: "",
      workProductType: h.type?.trim() ?? null,
    });
  }
  return out;
}
