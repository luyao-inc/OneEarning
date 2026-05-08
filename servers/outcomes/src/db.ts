import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";

const require = createRequire(import.meta.url);

function wasmPath(file: string): string {
  const candidates: string[] = [];
  try {
    const pkg = dirname(require.resolve("sql.js/package.json"));
    candidates.push(join(pkg, "dist", file));
  } catch {
    /* ignore */
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 16; i++) {
    candidates.push(join(dir, "node_modules", "sql.js", "dist", file));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0] ?? join(dirname(fileURLToPath(import.meta.url)), "node_modules", "sql.js", "dist", file);
}

let sqlJsStatic: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsStatic) {
    sqlJsStatic = await initSqlJs({
      locateFile: (file: string) => wasmPath(file),
    });
  }
  return sqlJsStatic;
}

const dbCache = new Map<string, SqlJsDatabase>();

export async function openOutcomesDb(dbPath: string): Promise<SqlJsDatabase> {
  const cached = dbCache.get(dbPath);
  if (cached) return cached;

  await mkdir(dirname(dbPath), { recursive: true });
  const SQL = await getSqlJs();
  let db: SqlJsDatabase;
  try {
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(dbPath);
    db = new SQL.Database(new Uint8Array(buf));
  } catch {
    db = new SQL.Database();
  }

  migrate(db);
  dbCache.set(dbPath, db);
  return db;
}

export async function persistDb(dbPath: string, db: SqlJsDatabase): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const data = db.export();
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, Buffer.from(data));
}

function migrate(db: SqlJsDatabase): void {
  db.run("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingest_meta (
      company_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (company_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS outcome_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      canonical TEXT NOT NULL,
      title TEXT,
      snippet TEXT,
      work_product_type TEXT,
      source_refs TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (company_id, project_id, canonical)
    );

    CREATE INDEX IF NOT EXISTS idx_outcome_project ON outcome_items (company_id, project_id);
  `);
}
