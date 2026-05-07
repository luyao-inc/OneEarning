import { join, resolve, relative, normalize } from "node:path";

export function agentKbRoot(baseRoot: string, companyId: string, agentId: string): string {
  return resolve(join(baseRoot, companyId, agentId));
}

export function indexDbPath(baseRoot: string, companyId: string, agentId: string): string {
  return resolve(join(baseRoot, ".index", companyId, `${agentId}.sqlite`));
}

export function safeRelPathInside(root: string, relOrAbs: string): string | null {
  const norm = relOrAbs.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!norm || norm.includes("..")) return null;
  const abs = resolve(root, ...norm.split("/").filter(Boolean));
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  return norm;
}

export function joinUnderRoot(root: string, relPath: string): string | null {
  const safe = safeRelPathInside(root, relPath);
  if (!safe) return null;
  return resolve(root, ...safe.split("/").filter(Boolean));
}
