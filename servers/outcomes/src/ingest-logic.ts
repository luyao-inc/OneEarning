import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { basename } from "node:path";
import type { Database as SqlJsDatabase } from "sql.js";
import {
  type ExtractedCandidate,
  normalizeLocalPath,
} from "./extract.js";

function rowDedupeKey(cand: ExtractedCandidate): string {
  if (cand.kind === "local_path") return `p:${cand.canonical.toLowerCase()}`;
  return `${cand.kind}:${cand.canonical}`;
}

export interface FileHintPayload {
  path: string;
  title?: string | null;
  attachmentId?: string;
  source?: string;
}

export interface BundleChunk {
  sourceKind: string;
  issueId?: string | null;
  text: string;
  truncated?: boolean;
  structuredHints?: Array<{ url?: string; title?: string; type?: string } | null | undefined>;
  fileHints?: FileHintPayload[];
}

export interface IngestRequestBody {
  companyId?: string;
  projectId?: string;
  contentHash?: string;
  bundle?: BundleChunk[];
}

export interface SourceRef {
  sourceKind: string;
  issueId: string | null;
  truncated: boolean;
}

export interface OutcomeRow {
  kind: string;
  canonical: string;
  title: string | null;
  snippet: string;
  workProductType: string | null;
  sourceRefs: SourceRef[];
}

function resolveExistingFilePath(raw: string): string | null {
  const norm = normalizeLocalPath(raw);
  if (!norm) return null;
  try {
    const st = statSync(norm);
    if (!st.isFile()) return null;
    return norm;
  } catch {
    return null;
  }
}

function fileHintToCandidate(pathRaw: string, title: string | null): ExtractedCandidate | null {
  const resolved = resolveExistingFilePath(pathRaw);
  if (!resolved) return null;
  const shortTitle = title?.trim() || basename(resolved);
  return {
    kind: "local_path",
    canonical: resolved,
    title: title?.trim() || null,
    snippet: shortTitle,
    workProductType: null,
  };
}

function mergeRows(map: Map<string, OutcomeRow>, cand: ExtractedCandidate, ref: SourceRef) {
  const canonicalStored = cand.canonical;
  const key = rowDedupeKey({ ...cand, canonical: canonicalStored });
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      kind: cand.kind,
      canonical: canonicalStored,
      title: cand.title,
      snippet: cand.snippet,
      workProductType: cand.workProductType,
      sourceRefs: [ref],
    });
    return;
  }
  existing.sourceRefs.push(ref);
  if (cand.title && (!existing.title || cand.title.length > existing.title.length)) {
    existing.title = cand.title;
  }
  if (cand.snippet.length > existing.snippet.length) {
    existing.snippet = cand.snippet;
  }
}

export function bundleToRows(bundle: BundleChunk[]): OutcomeRow[] {
  const map = new Map<string, OutcomeRow>();

  for (const chunk of bundle) {
    const ref: SourceRef = {
      sourceKind: chunk.sourceKind || "unknown",
      issueId: chunk.issueId ?? null,
      truncated: Boolean(chunk.truncated),
    };

    const hints = chunk.fileHints ?? [];
    for (const fh of hints) {
      const pathRaw = typeof fh.path === "string" ? fh.path.trim() : "";
      if (!pathRaw) continue;
      const cand = fileHintToCandidate(pathRaw, fh.title ?? null);
      if (!cand) continue;
      mergeRows(map, cand, ref);
    }
  }

  return [...map.values()].sort((a, b) => a.canonical.localeCompare(b.canonical));
}

export async function persistProjectOutcomes(
  db: SqlJsDatabase,
  dbPath: string,
  companyId: string,
  projectId: string,
  rows: OutcomeRow[],
  contentHash: string,
  persistFn: (path: string, db: SqlJsDatabase) => Promise<void>,
): Promise<void> {
  const now = Date.now();

  const del = db.prepare("DELETE FROM outcome_items WHERE company_id = ? AND project_id = ?");
  del.bind([companyId, projectId]);
  del.step();
  del.free();

  const ins = db.prepare(`
    INSERT INTO outcome_items (
      company_id, project_id, kind, canonical, title, snippet, work_product_type, source_refs, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of rows) {
    ins.bind([
      companyId,
      projectId,
      r.kind,
      r.canonical,
      r.title,
      r.snippet,
      r.workProductType,
      JSON.stringify(r.sourceRefs),
      now,
      now,
    ]);
    ins.step();
    ins.reset();
  }
  ins.free();

  const upsertMeta = db.prepare(`
    INSERT INTO ingest_meta (company_id, project_id, content_hash, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(company_id, project_id) DO UPDATE SET
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at
  `);
  upsertMeta.bind([companyId, projectId, contentHash, now]);
  upsertMeta.step();
  upsertMeta.free();

  await persistFn(dbPath, db);
}

export function getStoredHash(db: SqlJsDatabase, companyId: string, projectId: string): string | null {
  const stmt = db.prepare(
    "SELECT content_hash FROM ingest_meta WHERE company_id = ? AND project_id = ? LIMIT 1",
  );
  stmt.bind([companyId, projectId]);
  let hash: string | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { content_hash?: string };
    hash = typeof row.content_hash === "string" ? row.content_hash : null;
  }
  stmt.free();
  return hash;
}

export function stableHash(bundle: BundleChunk[], companyId: string, projectId: string): string {
  const h = createHash("sha256");
  h.update(companyId);
  h.update("\0");
  h.update(projectId);
  h.update("\0");
  for (const c of bundle) {
    h.update(c.sourceKind);
    h.update("\0");
    h.update(c.issueId ?? "");
    h.update("\0");
    h.update(c.text);
    h.update("\0");
    h.update(JSON.stringify(c.structuredHints ?? []));
    h.update("\0");
    h.update(JSON.stringify(c.fileHints ?? []));
    h.update("\0");
  }
  return h.digest("hex");
}
