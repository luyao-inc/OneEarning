/**
 * OneEarning — 成果侧车：基于语料块的确定性抽取 + SQLite。监听 PORT（必填）。
 */
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { Hono } from "hono";
import type { Database as SqlJsDatabase } from "sql.js";
import { openOutcomesDb, persistDb } from "./db.js";
import { classifyDisplay } from "./extract.js";
import {
  bundleToRows,
  getStoredHash,
  persistProjectOutcomes,
  stableHash,
  type BundleChunk,
  type IngestRequestBody,
} from "./ingest-logic.js";
import { outcomesDbPath } from "./paths.js";

const MAX_JSON_BYTES = 8 * 1024 * 1024;

function outcomesRoot(): string {
  const raw = process.env.ONEEARNING_OUTCOMES_ROOT;
  if (!raw?.trim()) {
    throw new Error("ONEEARNING_OUTCOMES_ROOT is required");
  }
  return raw.trim();
}

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "outcomes-sidecar" }));

app.post("/ingest", async (c) => {
  const raw = await c.req.arrayBuffer();
  if (raw.byteLength > MAX_JSON_BYTES) {
    return c.json({ error: "Payload too large" }, 413);
  }

  let body: IngestRequestBody;
  try {
    const text = new TextDecoder().decode(raw);
    body = JSON.parse(text) as IngestRequestBody;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const bundle = Array.isArray(body.bundle) ? (body.bundle as BundleChunk[]) : [];

  if (!companyId || !projectId) {
    return c.json({ error: "companyId and projectId required" }, 400);
  }

  const root = outcomesRoot();
  const dbPath = outcomesDbPath(root, companyId);
  const db = await openOutcomesDb(dbPath);

  const computedHash = stableHash(bundle, companyId, projectId);
  const incomingHash =
    typeof body.contentHash === "string" && body.contentHash.trim().length > 0
      ? body.contentHash.trim()
      : computedHash;

  const stored = getStoredHash(db, companyId, projectId);
  if (stored !== null && stored === incomingHash) {
    return c.json({
      ok: true,
      skipped: true,
      contentHash: incomingHash,
      itemCount: countItems(db, companyId, projectId),
    });
  }

  const rows = bundleToRows(bundle);
  await persistProjectOutcomes(db, dbPath, companyId, projectId, rows, incomingHash, persistDb);

  return c.json({
    ok: true,
    skipped: false,
    contentHash: incomingHash,
    itemCount: rows.length,
  });
});

function countItems(db: SqlJsDatabase, companyId: string, projectId: string): number {
  const stmt = db.prepare(
    "SELECT COUNT(*) AS n FROM outcome_items WHERE company_id = ? AND project_id = ?",
  );
  stmt.bind([companyId, projectId]);
  let n = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject() as { n?: number };
    n = typeof row.n === "number" ? row.n : Number(row.n ?? 0);
  }
  stmt.free();
  return n;
}

app.get("/items", async (c) => {
  const companyId = c.req.query("companyId")?.trim() ?? "";
  const projectId = c.req.query("projectId")?.trim() ?? "";
  if (!companyId || !projectId) {
    return c.json({ error: "companyId and projectId required" }, 400);
  }

  const root = outcomesRoot();
  const dbPath = outcomesDbPath(root, companyId);
  const db = await openOutcomesDb(dbPath);

  const stmt = db.prepare(`
    SELECT kind, canonical, title, snippet, work_product_type, source_refs, created_at, updated_at
    FROM outcome_items
    WHERE company_id = ? AND project_id = ?
    ORDER BY kind, canonical
  `);
  stmt.bind([companyId, projectId]);

  const items: Array<{
    kind: string;
    canonical: string;
    title: string | null;
    snippet: string;
    workProductType: string | null;
    sourceRefs: unknown;
    displayKind: string;
    createdAt: number;
    updatedAt: number;
  }> = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    const kind = String(row.kind ?? "url");
    const canonical = String(row.canonical ?? "");
    const title = row.title != null ? String(row.title) : null;
    const snippet = String(row.snippet ?? "");
    const workProductType = row.work_product_type != null ? String(row.work_product_type) : null;
    let sourceRefs: unknown = [];
    try {
      sourceRefs = JSON.parse(String(row.source_refs ?? "[]"));
    } catch {
      sourceRefs = [];
    }
    const k =
      kind === "local_path" ? "local_path" : kind === "work_product" ? "work_product" : "url";
    const dk =
      k === "local_path"
        ? classifyDisplay(canonical, "local_path")
        : classifyDisplay(canonical, k === "work_product" ? "work_product" : "url");
    items.push({
      kind: k,
      canonical,
      title,
      snippet,
      workProductType,
      sourceRefs,
      displayKind: dk,
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0),
    });
  }
  stmt.free();

  return c.json({ items, contentHash: getStoredHash(db, companyId, projectId) });
});

const port = Number(process.env.PORT ?? "");
if (!Number.isFinite(port) || port <= 0) {
  console.error("Outcomes sidecar: PORT is required");
  process.exit(1);
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  console.error(`Outcomes sidecar listening on http://127.0.0.1:${port}`);
});
