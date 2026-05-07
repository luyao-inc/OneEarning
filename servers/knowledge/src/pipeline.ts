import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Database as SqlJsDatabase } from "sql.js";
import { chunkText } from "./chunk.js";
import { resolveExtractor } from "./extractors/index.js";
import type { ExtractInput } from "./extractors/types.js";
import { persistDb } from "./db.js";
import { sha256File } from "./hash.js";
import { joinUnderRoot, safeRelPathInside } from "./paths.js";

export type DocKind = "text" | "pdf" | "audio" | "video" | "image" | "other";

export interface ReindexSummary {
  scanned: number;
  processed: number;
  skipped: number;
  failed: number;
  unsupported: number;
}

export function classifyKind(relPath: string, mime: string): DocKind {
  const lower = relPath.toLowerCase();
  const m = mime.toLowerCase();
  if (m.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(lower)) return "audio";
  if (m.startsWith("video/") || /\.(mp4|mkv|mov|webm|avi)$/i.test(lower)) return "video";
  if (m.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(lower)) return "image";
  if (m.includes("pdf") || lower.endsWith(".pdf")) return "pdf";
  if (
    m.startsWith("text/") ||
    m === "application/rtf" ||
    /\.(md|mdx|txt|json|csv|log|ts|tsx|js|jsx|yml|yaml|xml|html|htm|docx|rst|adoc|asciidoc)$/i.test(lower)
  )
    return "text";
  return "other";
}

export function guessMime(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".rtf")) return "application/rtf";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "application/x-yaml";
  return "application/octet-stream";
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const rootNorm = root.replace(/\\/g, "/").replace(/\/$/, "");
  async function walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === ".index") continue;
        out.push(...(await walk(full)));
      } else if (ent.isFile()) {
        let rel = full.replace(/\\/g, "/");
        if (rel.startsWith(rootNorm)) {
          rel = rel.slice(rootNorm.length).replace(/^\//, "");
        }
        out.push(rel);
      }
    }
    return out;
  }
  return walk(root);
}

export async function reindexAgent(params: {
  db: SqlJsDatabase;
  dbPath: string;
  kbRoot: string;
  companyId: string;
  agentId: string;
}): Promise<{ enqueued: number; processedSync: number; summary: ReindexSummary }> {
  const { db, dbPath, kbRoot } = params;
  const summary: ReindexSummary = {
    scanned: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    unsupported: 0,
  };

  let relPaths: string[];
  try {
    relPaths = await listFilesRecursive(kbRoot);
  } catch {
    relPaths = [];
  }

  const onDisk = new Set(relPaths);
  summary.scanned = relPaths.length;

  const existing = db.exec("SELECT path FROM docs");
  const rows = existing[0]?.values ?? [];
  for (const row of rows) {
    const p = String(row[0]);
    if (!onDisk.has(p)) {
      db.run("DELETE FROM docs WHERE path = ?", [p]);
    }
  }

  for (const rel of relPaths) {
    const abs = joinUnderRoot(kbRoot, rel);
    if (!abs) {
      summary.failed++;
      continue;
    }
    try {
      const st = await stat(abs);
      const mime = guessMime(rel);
      const kind = classifyKind(rel, mime);
      const hash = await sha256File(abs);

      const prev = db.exec("SELECT mtime, size, sha256, extractor_id, extractor_version, status FROM docs WHERE path = ?", [
        rel,
      ]);
      const pv = prev[0]?.values?.[0];
      if (
        pv &&
        Number(pv[0]) === Math.floor(st.mtimeMs) &&
        Number(pv[1]) === st.size &&
        String(pv[2]) === hash &&
        String(pv[5]) !== "pending" &&
        String(pv[5]) !== "extracting"
      ) {
        summary.skipped++;
        continue;
      }

      await processFile(db, kbRoot, rel, hash, mime, kind, st.mtimeMs, false);
      summary.processed++;
      const stRow = db.exec("SELECT status FROM docs WHERE path = ?", [rel]);
      const stv = stRow[0]?.values?.[0]?.[0];
      if (stv === "unsupported") summary.unsupported++;
      if (stv === "failed") summary.failed++;
    } catch {
      summary.failed++;
    }
  }

  await persistDb(dbPath, db);
  return { enqueued: 0, processedSync: summary.processed, summary };
}

export async function processFile(
  db: SqlJsDatabase,
  kbRoot: string,
  relPath: string,
  hash: string | null,
  mimeFallback: string,
  kindFallback: DocKind,
  mtimeMs: number,
  force: boolean,
): Promise<void> {
  const abs = joinUnderRoot(kbRoot, relPath);
  if (!abs) throw new Error("invalid path");

  const st = await stat(abs);
  const mime = mimeFallback || guessMime(relPath);
  const kind = kindFallback || classifyKind(relPath, mime);
  const sha = hash ?? (await sha256File(abs));

  if (!force) {
    const prev = db.exec(
      "SELECT mtime, size, sha256, status FROM docs WHERE path = ?",
      [relPath],
    );
    const pv = prev[0]?.values?.[0];
    if (
      pv &&
      Number(pv[0]) === Math.floor(st.mtimeMs) &&
      Number(pv[1]) === st.size &&
      String(pv[2]) === sha &&
      String(pv[3]) !== "failed"
    ) {
      return;
    }
  }

  db.run(
    `INSERT INTO docs(path, mtime, size, sha256, mime, kind, status, extractor_id, extractor_version, extracted_at, error)
     VALUES (?, ?, ?, ?, ?, ?, 'extracting', NULL, NULL, NULL, NULL)
     ON CONFLICT(path) DO UPDATE SET
       mtime=excluded.mtime, size=excluded.size, sha256=excluded.sha256, mime=excluded.mime, kind=excluded.kind,
       status='extracting', error=NULL`,
    [relPath, Math.floor(st.mtimeMs), st.size, sha, mime, kind],
  );

  db.run("DELETE FROM chunks WHERE doc_path = ?", [relPath]);
  db.run("DELETE FROM extractions WHERE doc_path = ?", [relPath]);

  const input: ExtractInput = { absPath: abs, mime, size: st.size };
  const extractor = resolveExtractor(input);

  if (!extractor) {
    db.run(
      `UPDATE docs SET status = 'unsupported', extractor_id = NULL, extractor_version = NULL,
       extracted_at = ?, error = ? WHERE path = ?`,
      [Date.now(), "no_extractor", relPath],
    );
    return;
  }

  let text = "";
  let warnings: string[] | undefined;
  let meta: Record<string, unknown> | undefined;
  try {
    const result = await extractor.extract(input);
    text = result.text ?? "";
    warnings = result.warnings;
    meta = result.meta;
  } catch (e) {
    db.run(
      `UPDATE docs SET status = 'failed', extractor_id = ?, extractor_version = ?, extracted_at = ?, error = ? WHERE path = ?`,
      [
        extractor.id,
        extractor.version,
        Date.now(),
        e instanceof Error ? e.message : String(e),
        relPath,
      ],
    );
    return;
  }

  const now = Date.now();

  if (!text.trim()) {
    const w = warnings?.join(",") ?? "empty";
    db.run(
      `UPDATE docs SET status = 'unsupported', extractor_id = ?, extractor_version = ?, extracted_at = ?, error = ? WHERE path = ?`,
      [extractor.id, extractor.version, now, w, relPath],
    );
    return;
  }

  if (kind === "pdf" && warnings?.includes("no_text_layer")) {
    db.run(
      `UPDATE docs SET status = 'unsupported', extractor_id = ?, extractor_version = ?, extracted_at = ?, error = ? WHERE path = ?`,
      [extractor.id, extractor.version, now, "no_text_layer", relPath],
    );
    return;
  }

  const pieces = chunkText(text, relPath);
  if (pieces.length === 0) {
    db.run(
      `UPDATE docs SET status = 'unsupported', extractor_id = ?, extractor_version = ?, extracted_at = ?, error = ? WHERE path = ?`,
      [extractor.id, extractor.version, now, "no_chunks", relPath],
    );
    return;
  }

  db.run(
    `INSERT INTO extractions(doc_path, text, char_count, meta, warnings, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      relPath,
      text,
      text.length,
      meta ? JSON.stringify(meta) : null,
      warnings ? JSON.stringify(warnings) : null,
      now,
    ],
  );

  for (const p of pieces) {
    db.run(
      `INSERT INTO chunks(doc_path, chunk_idx, heading_path, t_start_ms, t_end_ms, content)
       VALUES (?, ?, ?, NULL, NULL, ?)`,
      [relPath, p.chunkIdx, p.headingPath, p.content],
    );
  }

  db.run(
    `UPDATE docs SET status = 'indexed', extractor_id = ?, extractor_version = ?, extracted_at = ?, error = NULL WHERE path = ?`,
    [extractor.id, extractor.version, now, relPath],
  );
}

export async function deleteIndexedFile(db: SqlJsDatabase, kbRoot: string, relPath: string): Promise<void> {
  const safe = safeRelPathInside(kbRoot, relPath);
  if (!safe) throw new Error("invalid path");
  db.run("DELETE FROM docs WHERE path = ?", [safe]);
}

function tokenizeSearchQuery(userQuery: string): string[] {
  return userQuery
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 12);
}

/** Escape LIKE metacharacters inside literal (used with ESCAPE '\\'). */
function likeLiteralSubstring(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function escapeHtmlSnippet(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSnippet(content: string, tokens: string[], radius = 48): string {
  if (!content.length) return "";
  const lowerContent = content.toLowerCase();
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    const i = lowerContent.indexOf(t);
    if (i >= 0) {
      const start = Math.max(0, i - radius);
      const end = Math.min(content.length, i + raw.length + radius);
      const before = escapeHtmlSnippet(content.slice(start, i));
      const mid = escapeHtmlSnippet(content.slice(i, i + raw.length));
      const after = escapeHtmlSnippet(content.slice(i + raw.length, end));
      return (
        (start > 0 ? "… " : "") +
        before +
        "<mark>" +
        mid +
        "</mark>" +
        after +
        (end < content.length ? " …" : "")
      );
    }
  }
  const head = content.slice(0, 120);
  return escapeHtmlSnippet(head) + (content.length > 120 ? " …" : "");
}

/** Full-text search without FTS5 (sql.js WASM does not ship fts5). */
export function searchFts(
  db: SqlJsDatabase,
  query: string,
  topK: number,
): Array<{
  docPath: string;
  chunkIdx: number;
  snippet: string;
  score: number;
  tStartMs: number | null;
  tEndMs: number | null;
}> {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  try {
    const patterns = tokens.map((t) => `%${likeLiteralSubstring(t)}%`);
    const whereClause = patterns.map(() => "content LIKE ? ESCAPE '\\'").join(" AND ");
    const fetchLimit = Math.min(Math.max(topK * 20, 50), 500);

    const stmt = db.prepare(`
      SELECT doc_path, chunk_idx, t_start_ms, t_end_ms, content
      FROM chunks
      WHERE ${whereClause}
      LIMIT ${fetchLimit}
    `);
    stmt.bind(patterns);

    type Hit = {
      docPath: string;
      chunkIdx: number;
      snippet: string;
      score: number;
      tStartMs: number | null;
      tEndMs: number | null;
    };

    const hits: Hit[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      const content = String(row.content ?? "");
      const overlap = tokens.reduce(
        (n, tok) => n + (content.toLowerCase().includes(tok.toLowerCase()) ? 1 : 0),
        0,
      );
      hits.push({
        docPath: String(row.doc_path ?? ""),
        chunkIdx: Number(row.chunk_idx ?? 0),
        snippet: buildSnippet(content, tokens),
        score: overlap / tokens.length + 1 / (1 + content.length / 10000),
        tStartMs: row.t_start_ms != null ? Number(row.t_start_ms) : null,
        tEndMs: row.t_end_ms != null ? Number(row.t_end_ms) : null,
      });
    }
    stmt.free();

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  } catch {
    return [];
  }
}
