/**
 * OneEarning — Knowledge 侧车：提取管道 + SQLite FTS5。监听 PORT（必填）。
 */
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";
import type { Context } from "hono";
import { openIndexDb, persistDb } from "./db.js";
import { agentKbRoot, indexDbPath, joinUnderRoot } from "./paths.js";
import {
  deleteIndexedFile,
  processFile,
  reindexAgent,
  searchFts,
  classifyKind,
  guessMime,
} from "./pipeline.js";
import { sha256File } from "./hash.js";

function kbRoot(): string {
  const raw = process.env.ONEEARNING_KB_ROOT;
  if (!raw?.trim()) {
    throw new Error("ONEEARNING_KB_ROOT is required");
  }
  return raw.trim();
}

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "knowledge-sidecar" }));

app.post("/reindex", async (c) => {
  let body: { companyId?: string; agentId?: string };
  try {
    body = (await c.req.json()) as { companyId?: string; agentId?: string };
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  if (!companyId || !agentId) {
    return c.json({ error: "companyId and agentId required" }, 400);
  }

  const root = kbRoot();
  const kb = agentKbRoot(root, companyId, agentId);
  const dbPath = indexDbPath(root, companyId, agentId);
  const db = await openIndexDb(dbPath);
  const result = await reindexAgent({ db, dbPath, kbRoot: kb, companyId, agentId });
  return c.json(result);
});

app.post("/index-file", async (c) => {
  let body: { companyId?: string; agentId?: string; relPath?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const relPath = typeof body.relPath === "string" ? body.relPath.trim() : "";
  if (!companyId || !agentId || !relPath) {
    return c.json({ error: "companyId, agentId, relPath required" }, 400);
  }

  const root = kbRoot();
  const kb = agentKbRoot(root, companyId, agentId);
  const dbPath = indexDbPath(root, companyId, agentId);
  const db = await openIndexDb(dbPath);
  const abs = joinUnderRoot(kb, relPath);
  if (!abs) return c.json({ error: "invalid relPath" }, 400);
  try {
    const { stat } = await import("node:fs/promises");
    const st = await stat(abs);
    const mime = guessMime(relPath);
    const kind = classifyKind(relPath, mime);
    const hash = await sha256File(abs);
    await processFile(db, kb, relPath, hash, mime, kind, st.mtimeMs, true);
    await persistDb(dbPath, db);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.post("/reextract", async (c) => {
  let body: { companyId?: string; agentId?: string; relPath?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const relPath = typeof body.relPath === "string" ? body.relPath.trim() : "";
  if (!companyId || !agentId || !relPath) {
    return c.json({ error: "companyId, agentId, relPath required" }, 400);
  }

  const root = kbRoot();
  const kb = agentKbRoot(root, companyId, agentId);
  const dbPath = indexDbPath(root, companyId, agentId);
  const db = await openIndexDb(dbPath);
  const abs2 = joinUnderRoot(kb, relPath);
  if (!abs2) return c.json({ error: "invalid relPath" }, 400);
  try {
    const { stat } = await import("node:fs/promises");
    const st = await stat(abs2);
    const mime = guessMime(relPath);
    const kind = classifyKind(relPath, mime);
    const hash = await sha256File(abs2);
    await processFile(db, kb, relPath, hash, mime, kind, st.mtimeMs, true);
    await persistDb(dbPath, db);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function handleRemoveFromIndex(c: Context) {
  let body: { companyId?: string; agentId?: string; relPath?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const relPath = typeof body.relPath === "string" ? body.relPath.trim() : "";
  if (!companyId || !agentId || !relPath) {
    return c.json({ error: "companyId, agentId, relPath required" }, 400);
  }

  const root = kbRoot();
  const kb = agentKbRoot(root, companyId, agentId);
  const dbPath = indexDbPath(root, companyId, agentId);
  const db = await openIndexDb(dbPath);
  try {
    deleteIndexedFile(db, kb, relPath);
    await persistDb(dbPath, db);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

app.delete("/file", handleRemoveFromIndex);
/** Browser fetch 对 DELETE + body 支持不一，提供 POST 别名 */
app.post("/remove-file", handleRemoveFromIndex);

app.post("/search", async (c) => {
  let body: { companyId?: string; agentId?: string; q?: string; topK?: number };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const q = typeof body.q === "string" ? body.q : "";
  const topK = typeof body.topK === "number" && body.topK > 0 ? Math.min(body.topK, 50) : 12;
  if (!companyId || !agentId) {
    return c.json({ error: "companyId and agentId required" }, 400);
  }

  try {
    const root = kbRoot();
    const dbPath = indexDbPath(root, companyId, agentId);
    const db = await openIndexDb(dbPath);
    const hits = searchFts(db, q, topK);
    return c.json({
      hits: hits.map((h) => ({
        docPath: h.docPath,
        chunkIdx: h.chunkIdx,
        snippet: h.snippet,
        score: h.score,
        tStartMs: h.tStartMs,
        tEndMs: h.tEndMs,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[knowledge] POST /search failed:", msg);
    return c.json({ error: msg, hits: [] }, 500);
  }
});

app.get("/info", async (c) => {
  const companyId = c.req.query("companyId")?.trim() ?? "";
  const agentId = c.req.query("agentId")?.trim() ?? "";
  if (!companyId || !agentId) {
    return c.json({ error: "companyId and agentId required" }, 400);
  }
  const root = kbRoot();
  const dbPath = indexDbPath(root, companyId, agentId);
  try {
    const db = await openIndexDb(dbPath);
    const statFile = await import("node:fs/promises").then((m) => m.stat);
    let sizeBytes = 0;
    try {
      const st = await statFile(dbPath);
      sizeBytes = st.size;
    } catch {
      sizeBytes = 0;
    }

    const count = (sql: string): number => {
      const r = db.exec(sql);
      const v = r[0]?.values?.[0]?.[0];
      return typeof v === "number" ? v : Number(v ?? 0);
    };

    const docCount = count("SELECT COUNT(*) FROM docs");
    const indexedCount = count("SELECT COUNT(*) FROM docs WHERE status = 'indexed'");
    const pendingCount = count(
      "SELECT COUNT(*) FROM docs WHERE status IN ('pending','extracting')",
    );
    const failedCount = count("SELECT COUNT(*) FROM docs WHERE status = 'failed'");
    const unsupportedCount = count("SELECT COUNT(*) FROM docs WHERE status = 'unsupported'");

    return c.json({
      docCount,
      indexedCount,
      pendingCount,
      failedCount,
      unsupportedCount,
      indexedAt: Date.now(),
      sizeBytes,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.get("/status", async (c) => {
  const companyId = c.req.query("companyId")?.trim() ?? "";
  const agentId = c.req.query("agentId")?.trim() ?? "";
  if (!companyId || !agentId) {
    return c.json({ error: "companyId and agentId required" }, 400);
  }
  const root = kbRoot();
  const dbPath = indexDbPath(root, companyId, agentId);
  try {
    const db = await openIndexDb(dbPath);
    const filesStmt = db.prepare(
      "SELECT path, kind, status, extractor_id, error FROM docs ORDER BY path",
    );
    const files: Array<{ path: string; kind: string; status: string; extractorId: string | null; error: string | null }> =
      [];
    filesStmt.bind([]);
    while (filesStmt.step()) {
      const row = filesStmt.getAsObject() as Record<string, unknown>;
      files.push({
        path: String(row.path ?? ""),
        kind: String(row.kind ?? ""),
        status: String(row.status ?? ""),
        extractorId: row.extractor_id != null ? String(row.extractor_id) : null,
        error: row.error != null ? String(row.error) : null,
      });
    }
    filesStmt.free();

    const jobsStmt = db.prepare(
      "SELECT id, kind, doc_path, status, error FROM jobs ORDER BY id DESC LIMIT 50",
    );
    jobsStmt.bind([]);
    const jobs: Array<{ id: number; kind: string; docPath: string | null; status: string; error: string | null }> =
      [];
    while (jobsStmt.step()) {
      const row = jobsStmt.getAsObject() as Record<string, unknown>;
      jobs.push({
        id: Number(row.id ?? 0),
        kind: String(row.kind ?? ""),
        docPath: row.doc_path != null ? String(row.doc_path) : null,
        status: String(row.status ?? ""),
        error: row.error != null ? String(row.error) : null,
      });
    }
    jobsStmt.free();

    return c.json({ files, jobs });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

const port = Number(process.env.PORT ?? "");
if (!Number.isFinite(port) || port <= 0) {
  console.error("Knowledge sidecar: PORT is required");
  process.exit(1);
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.error(`Knowledge sidecar listening on http://127.0.0.1:${port}`);
});
