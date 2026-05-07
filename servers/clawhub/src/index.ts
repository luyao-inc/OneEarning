/**
 * OneEarning — Clawhub 侧车：解析 slug / CLI，拉 Registry + zip，返回 Paperclip 可用的导入描述。
 * 监听 PORT（必填）。
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseClawhubSlug } from "./parse-input.js";
import { downloadSkillZip, fetchSkillMetadata, normalizeRegistry } from "./registry.js";
import {
  collectTextFilesFromZip,
  getPrimarySkillMd,
  injectClawhubMarker,
  type ZipTextFile,
} from "./zip-extract.js";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "clawhub-sidecar" }));

export type ResolveBody = {
  rawInput: string;
  registry?: string;
  token?: string | null;
  force?: boolean;
};

export type ResolveResponseGithub = {
  kind: "github";
  slug: string;
  version: string;
  paperclipSource: string;
  moderation?: { isSuspicious?: boolean };
  warnings: string[];
};

export type ResolveResponseMultiFile = {
  kind: "multiFile";
  slug: string;
  version: string;
  /** 已写入 oneearningRegistry 标记的 SKILL.md 正文 */
  skillMarkdown: string;
  /** 其余相对路径文件（不含 SKILL.md 主条目时可含子路径） */
  extraFiles: ZipTextFile[];
  warnings: string[];
};

app.post("/resolve", async (c) => {
  let body: ResolveBody;
  try {
    body = (await c.req.json()) as ResolveBody;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const warnings: string[] = [];
  const registry = normalizeRegistry(body.registry);
  const token = typeof body.token === "string" && body.token.length > 0 ? body.token : null;
  const force = Boolean(body.force);

  let slug: string;
  try {
    slug = parseClawhubSlug(String(body.rawInput ?? ""));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }

  let latestVersion: string | null;
  let moderation: { isMalwareBlocked?: boolean; isSuspicious?: boolean };
  try {
    const meta = await fetchSkillMetadata(registry, slug, token);
    latestVersion = meta.latestVersion;
    moderation = meta.moderation;
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  if (moderation?.isMalwareBlocked) {
    return c.json({ error: "该技能已被列为恶意软件，无法导入。", code: "MODERATION_BLOCKED" }, 403);
  }

  if (moderation?.isSuspicious && !force) {
    return c.json(
      {
        error: "该技能被标记为可疑，若确认承担风险请勾选强制导入后重试。",
        code: "MODERATION_SUSPICIOUS",
        requiresForce: true,
      },
      409,
    );
  }

  if (moderation?.isSuspicious && force) {
    warnings.push("该技能曾被标记为可疑，仍按你的要求继续导入。");
  }

  if (!latestVersion) {
    return c.json({ error: "无法解析技能版本号" }, 422);
  }

  let zip: Uint8Array;
  try {
    zip = await downloadSkillZip(registry, slug, latestVersion, token);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  let files: ReturnType<typeof collectTextFilesFromZip>;
  try {
    files = collectTextFilesFromZip(zip);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 422);
  }

  const primaryMd = getPrimarySkillMd(files);
  // 始终从 Registry zip 走 multiFile：SKILL.md 里即使有 GitHub 链接，Paperclip 的「从 GitHub 导入」通常只拉条目不保留 Clawhub 包内完整目录（如 assets/），与 Clawhub 发布的 zip 不一致。

  const skillFile =
    files.find((f) => f.path.toLowerCase() === "skill.md")
    ?? files.find((f) => f.path.toLowerCase().endsWith("/skill.md"));
  const skillPath = skillFile?.path ?? "SKILL.md";
  const baseSkillMd = skillFile?.content ?? primaryMd;
  const skillMdMarked = injectClawhubMarker(baseSkillMd, slug);

  const extraFiles = files
    .filter((f) => f.path !== skillPath)
    .map((f) => ({ path: f.path, content: f.content }));

  const out: ResolveResponseMultiFile = {
    kind: "multiFile",
    slug,
    version: latestVersion,
    skillMarkdown: skillMdMarked,
    extraFiles,
    warnings,
  };
  return c.json(out);
});

const port = Number(process.env.PORT ?? "");
if (!Number.isFinite(port) || port <= 0) {
  console.error("[clawhub-sidecar] Missing or invalid PORT");
  process.exit(1);
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
console.error(`[clawhub-sidecar] listening on http://127.0.0.1:${port}`);
