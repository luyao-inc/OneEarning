import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";

const require = createRequire(import.meta.url);

/** sql.js WASM：pnpm 根目录与侧车 cwd 下解析路径可能不同，逐个探测存在的文件。 */
function wasmPath(file: string): string {
  const candidates: string[] = [];
  try {
    const pkg = dirname(require.resolve("sql.js/package.json"));
    candidates.push(join(pkg, "dist", file));
  } catch {
    /* 例如入口被 bundle / 路径异常时 require.resolve 失败 */
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

export async function openIndexDb(dbPath: string): Promise<SqlJsDatabase> {
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
  try {
    db.exec(`
      DROP TRIGGER IF EXISTS chunks_ai;
      DROP TRIGGER IF EXISTS chunks_ad;
      DROP TRIGGER IF EXISTS chunks_au;
    `);
  } catch {
    /* ignore */
  }
  try {
    db.exec(`DROP TABLE IF EXISTS chunks_fts;`);
  } catch {
    /* ignore */
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT,
      mime TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      extractor_id TEXT,
      extractor_version TEXT,
      extracted_at INTEGER,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS extractions (
      doc_path TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      language TEXT,
      char_count INTEGER,
      meta TEXT,
      warnings TEXT,
      created_at INTEGER,
      FOREIGN KEY (doc_path) REFERENCES docs(path) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_path TEXT NOT NULL REFERENCES docs(path) ON DELETE CASCADE,
      chunk_idx INTEGER NOT NULL,
      heading_path TEXT,
      t_start_ms INTEGER,
      t_end_ms INTEGER,
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      doc_path TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );
  `);
}

export function closeAllDb(): void {
  for (const db of dbCache.values()) {
    db.close();
  }
  dbCache.clear();
}
