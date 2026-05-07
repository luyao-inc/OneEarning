/**
 * 调用本机 Clawhub 侧车（经 Electron `/api/oneearning/clawhub/*` 代理）。
 */

export type ResolveClawhubBody = {
  rawInput: string;
  registry?: string;
  token?: string | null;
  force?: boolean;
};

export type ResolveClawhubResponseGithub = {
  kind: "github";
  slug: string;
  version: string;
  paperclipSource: string;
  moderation?: { isSuspicious?: boolean };
  warnings: string[];
};

export type ResolveClawhubResponseMultiFile = {
  kind: "multiFile";
  slug: string;
  version: string;
  skillMarkdown: string;
  extraFiles: { path: string; content: string }[];
  warnings: string[];
};

export type ResolveClawhubResponse = ResolveClawhubResponseGithub | ResolveClawhubResponseMultiFile;

export type ResolveClawhubErrorPayload = {
  error?: string;
  /** 例如 MODERATION_BLOCKED、MODERATION_SUSPICIOUS */
  code?: string;
  requiresForce?: boolean;
};

export function parseSkillFrontmatterForCreate(skillMd: string): {
  name: string;
  slug?: string | null;
  description?: string | null;
} {
  const m = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    return { name: "Imported skill", slug: null, description: null };
  }
  const block = m[1]!;
  const name =
    block.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "Imported skill";
  const slugRaw = block.match(/^slug:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  const descRaw = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return {
    name,
    slug: slugRaw.length > 0 ? slugRaw : null,
    description: descRaw?.length ? descRaw : null,
  };
}

export async function resolveClawhubImport(body: ResolveClawhubBody): Promise<ResolveClawhubResponse> {
  const res = await fetch("/api/oneearning/clawhub/resolve", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text.length ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const err = json as ResolveClawhubErrorPayload;
    const msg = typeof err?.error === "string" ? err.error : `HTTP ${res.status}`;
    const e = new Error(msg) as Error & {
      status: number;
      code?: string;
      requiresForce?: boolean;
      payload?: ResolveClawhubErrorPayload;
    };
    e.status = res.status;
    e.code = typeof err?.code === "string" ? err.code : undefined;
    e.requiresForce = Boolean(err?.requiresForce);
    e.payload = err;
    throw e;
  }

  return json as ResolveClawhubResponse;
}

export function isClawhubRegistrySkill(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const v = (metadata as Record<string, unknown>).oneearningRegistry;
  return v === "clawhub";
}

/** 用户明确指向 Clawhub（不应再 fallback 到 Paperclip 通用导入）。 */
export function isExplicitClawhubInput(raw: string): boolean {
  const s = raw.trim();
  if (/^https?:\/\/(www\.)?clawhub\.ai\b/i.test(s)) return true;
  return /clawhub\s+install|clawdhub\s+install|openclaw\s+skills?\s+install/i.test(s);
}

/**
 * 应用上方统一输入框：是否应先走 Clawhub 侧车解析。
 * - 显式 Clawhub CLI / clawhub.ai URL
 * - 单行 slug（无 `/`）：优先侧车；失败时可回落 Paperclip（若调用方选择）。
 */
export function shouldResolveViaClawhub(raw: string): boolean {
  const s = raw.trim();
  if (!s.length) return false;
  if (/^npx\s+/i.test(s)) return false;
  if (/^https?:\/\//i.test(s)) {
    return /^https?:\/\/(www\.)?clawhub\.ai\b/i.test(s);
  }
  if (isExplicitClawhubInput(s)) return true;
  if (s.includes("/") || s.includes("\\") || s.includes("..")) return false;
  if (/^[a-z0-9][a-z0-9-]*$/i.test(s)) return true;
  return false;
}

/** 在详情页打开 Clawhub 站点（技能列表或 `/skills/{slug}` 详情）。 */
export function getClawhubWebUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!isClawhubRegistrySkill(metadata)) return null;
  const slug = (metadata as Record<string, unknown>).oneearningClawhubSlug;
  if (typeof slug === "string" && slug.length > 0) {
    return `https://clawhub.ai/skills/${encodeURIComponent(slug)}`;
  }
  return "https://clawhub.ai/skills";
}
