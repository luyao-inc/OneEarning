import { unzipSync } from "fflate";
import { dirname, normalize } from "node:path";

const DEFAULT_MAX_ZIP_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 200_000;

const TEXT_EXT = new Set([
  "md",
  "mdx",
  "txt",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "csv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "sh",
  "ps1",
  "py",
  "rs",
  "go",
  "sql",
  "html",
  "css",
  "xml",
  "svg",
  "graphql",
  "http",
]);

export type ZipTextFile = { path: string; content: string };

function isSafeRelPath(p: string): boolean {
  if (!p || p.length > 512) return false;
  const n = normalize(p).replace(/\\/g, "/");
  if (n.startsWith("..") || n.includes("/../") || n.startsWith("/") || n.includes("..\\")) {
    return false;
  }
  return !n.split("/").some((seg) => seg === "..");
}

function extOf(p: string): string {
  const base = p.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i === -1 ? "" : base.slice(i + 1).toLowerCase();
}

/**
 * 解压 Clawhub zip，收集可编辑文本文件（含路径安全校验）。
 */
export function collectTextFilesFromZip(
  zipBytes: Uint8Array,
  options: { maxZipBytes?: number; maxFileBytes?: number } = {},
): ZipTextFile[] {
  const maxZip = options.maxZipBytes ?? DEFAULT_MAX_ZIP_BYTES;
  const maxFile = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (zipBytes.byteLength > maxZip) {
    throw new Error(`技能包过大（>${Math.floor(maxZip / (1024 * 1024))}MB）`);
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new Error("ZIP 解压失败");
  }

  const files: ZipTextFile[] = [];
  const rootPrefix = findSkillRootPrefix(Object.keys(entries));

  for (const [rawPath, data] of Object.entries(entries)) {
    if (!isSafeRelPath(rawPath)) continue;
    const rel = rootPrefix && rawPath.startsWith(rootPrefix) ? rawPath.slice(rootPrefix.length) : rawPath;
    const relNorm = rel.replace(/^\//, "");
    if (!relNorm || relNorm.endsWith("/")) continue;
    const ext = extOf(relNorm);
    if (!TEXT_EXT.has(ext)) continue;
    if (data.byteLength > maxFile) continue;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
    if (!text.length) continue;
    const path = relNorm.split("\\").join("/");
    files.push({ path, content: text });
  }

  if (!files.some((f) => f.path.toLowerCase() === "skill.md" || f.path.toLowerCase().endsWith("/skill.md"))) {
    throw new Error("技能包中未找到 SKILL.md");
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** 若 zip 内为单目录包裹，则去掉该前缀以符合 Paperclip 根路径习惯。 */
function findSkillRootPrefix(paths: string[]): string {
  const filtered = paths.filter((p) => p && !p.endsWith("/") && isSafeRelPath(p));
  if (filtered.length === 0) return "";
  const withSkill = filtered.find((p) => p.toLowerCase().endsWith("skill.md"));
  if (!withSkill) return "";
  const dir = dirname(withSkill).split("\\").join("/");
  if (!dir || dir === ".") return "";
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  const allUnder = filtered.every((p) => p === dir || p.startsWith(prefix) || p === withSkill);
  return allUnder ? prefix : "";
}

export function getPrimarySkillMd(files: ZipTextFile[]): string {
  const direct = files.find((f) => f.path.toLowerCase() === "skill.md");
  if (direct) return direct.content;
  const nested = files.find((f) => f.path.toLowerCase().endsWith("/skill.md"));
  if (nested) return nested.content;
  return files[0]!.content;
}

/** 在 YAML frontmatter 注入扁平字段（Paperclip 会进入 skill.metadata，便于 UI 徽章）。 */
export function injectClawhubMarker(skillMd: string, slug: string): string {
  if (/oneearningRegistry:\s*clawhub/m.test(skillMd)) return skillMd;
  if (!skillMd.startsWith("---")) {
    return `---\noneearningRegistry: clawhub\noneearningClawhubSlug: ${JSON.stringify(slug)}\n---\n\n${skillMd}`;
  }
  const end = skillMd.indexOf("\n---", 3);
  if (end === -1) return skillMd;
  const inner = skillMd.slice(3, end);
  const rest = skillMd.slice(end + 4);
  if (/oneearningRegistry:/m.test(inner)) return skillMd;
  const augmented = `${inner}\noneearningRegistry: clawhub\noneearningClawhubSlug: ${JSON.stringify(slug)}\n`;
  return `---\n${augmented}---${rest}`;
}
