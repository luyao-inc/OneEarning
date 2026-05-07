/** 从粘贴文本中提取 Clawhub slug（安全：禁止路径穿越）。 */

export function parseClawhubSlug(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed.length) {
    throw new Error("请输入技能 slug 或 clawhub install … 命令");
  }

  const patterns: RegExp[] = [
    /^clawhub\s+install\s+(\S+)/i,
    /^clawdhub\s+install\s+(\S+)/i,
    /^openclaw\s+skills\s+install\s+(\S+)/i,
    /^openclaw\s+skill\s+install\s+(\S+)/i,
  ];

  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return normalizeSlugToken(m[1]);
  }

  if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed) && !trimmed.includes("/") && !trimmed.includes("\\")) {
    return trimmed.toLowerCase();
  }

  throw new Error("无法识别输入。请使用 slug，或例如：clawhub install my-skill");
}

function normalizeSlugToken(token: string): string {
  const t = token.replace(/^['"]|['"]$/g, "").trim();
  if (!t || t.includes("/") || t.includes("\\") || t.includes("..")) {
    throw new Error("无效的技能 slug");
  }
  return t.toLowerCase();
}
