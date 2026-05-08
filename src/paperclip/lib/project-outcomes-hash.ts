import type { OutcomesBundleChunk } from "../api/outcomes";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function concatUtf8(parts: string[]): Uint8Array {
  const enc = new TextEncoder();
  let len = 0;
  const chunks = parts.map((p) => enc.encode(p));
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** 与 servers/outcomes `stableHash` 字节序列一致 */
export async function stableContentHash(
  bundle: OutcomesBundleChunk[],
  companyId: string,
  projectId: string,
): Promise<string> {
  const parts: string[] = [];
  parts.push(companyId, "\0", projectId, "\0");
  for (const c of bundle) {
    parts.push(c.sourceKind, "\0", c.issueId ?? "", "\0", c.text, "\0");
    parts.push(JSON.stringify(c.structuredHints ?? []), "\0");
    parts.push(JSON.stringify(c.fileHints ?? []), "\0");
  }
  return sha256Hex(concatUtf8(parts));
}
