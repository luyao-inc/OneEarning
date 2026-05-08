import type { Issue, Project } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import type { OutcomesBundleChunk } from "../api/outcomes";
import { projectsApi } from "../api/projects";
import { stableContentHash } from "./project-outcomes-hash";

const ISSUE_BATCH = 8;
const MAX_REL_PATHS_PER_ISSUE = 40;

async function mapInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    await Promise.all(slice.map((item) => fn(item)));
  }
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function fileBasename(p: string): string {
  const n = p.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

/** 项目绑定的本地工作区根（用于把评论里的 docs/xxx.md 拼成绝对路径） */
function resolveWorkspaceRoot(project: Project): string | null {
  const cb = project.codebase;
  const w =
    cb?.effectiveLocalFolder?.trim() ||
    cb?.localFolder?.trim() ||
    project.primaryWorkspace?.cwd?.trim() ||
    cb?.managedFolder?.trim() ||
    "";
  return w.length > 0 ? w : null;
}

function joinWorkspaceRoot(root: string, relPosix: string): string {
  const rel = relPosix.replace(/\\/g, "/").replace(/^\.?\//, "");
  const isUnc = root.startsWith("\\\\");
  const winDrive = /^[A-Za-z]:/.test(root);
  if (winDrive || isUnc) {
    const base = root.replace(/[/\\]+$/, "");
    const segs = rel.split("/").filter((s) => s.length > 0);
    return [base, ...segs].join("\\");
  }
  const base = root.replace(/\/+$/, "");
  return `${base}/${rel}`;
}

/**
 * 从正文提取「仓库相对路径」候选（至少含一层目录，避免误匹配 README 单词）。
 * 覆盖 docs/foo.md、src/a/b.ts 等智能体评论常见写法。
 */
function extractRelativeRepoPaths(text: string): string[] {
  if (!text?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re =
    /\b((?:[\w.-]+\/)+[\w.-]+\.(?:md|markdown|pdf|txt|tsx?|jsx?|mjs|cjs|json|yaml|yml|png|jpe?g|gif|webp|svg|zip|csv|rs|go|py))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let rel = m[1].replace(/\\/g, "/").replace(/^\.\//, "");
    if (/^https?:\/\//i.test(rel)) continue;
    const key = rel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rel);
    if (out.length >= MAX_REL_PATHS_PER_ISSUE) break;
  }
  return out;
}

/**
 * 结构化来源：
 * - Issue 附件 contentPath、非链接 Work Product 本地路径
 * - 任务标题/描述与评论中出现的相对路径 + 项目代码库本地目录 → 绝对路径（侧车再校验文件存在）
 */
export async function buildProjectOutcomesCorpus(
  companyId: string,
  projectId: string,
  projectLookupRef: string,
): Promise<{ bundle: OutcomesBundleChunk[]; contentHash: string }> {
  const project = await projectsApi.get(projectLookupRef, companyId);
  const workspaceRoot = resolveWorkspaceRoot(project);

  const issues = await issuesApi.list(companyId, { projectId, limit: 500 });

  const chunks: OutcomesBundleChunk[] = [];

  await mapInBatches(issues, ISSUE_BATCH, async (issue: Issue) => {
    const issueId = issue.id;

    const [attachments, workProducts, comments] = await Promise.all([
      issuesApi.listAttachments(issueId),
      issuesApi.listWorkProducts(issueId),
      issuesApi.listComments(issueId, { limit: 500, order: "asc" }),
    ]);

    for (const a of attachments) {
      const p = typeof a.contentPath === "string" ? a.contentPath.trim() : "";
      if (!p.length) continue;
      chunks.push({
        sourceKind: "attachment",
        issueId,
        text: "",
        fileHints: [
          {
            path: p,
            title: a.originalFilename ?? null,
            attachmentId: a.id,
            source: "attachment",
          },
        ],
      });
    }

    const wpLocal = workProducts.filter((wp) => {
      const u = typeof wp.url === "string" ? wp.url.trim() : "";
      if (!u.length || isHttpUrl(u)) return false;
      return true;
    });

    for (const wp of wpLocal) {
      const p = wp.url!.trim();
      chunks.push({
        sourceKind: "work_product_file",
        issueId,
        text: "",
        fileHints: [
          {
            path: p,
            title: wp.title ?? null,
            source: `work_product:${wp.type}`,
          },
        ],
      });
    }

    if (workspaceRoot) {
      const bodies: string[] = [];
      if (typeof issue.title === "string" && issue.title.trim()) bodies.push(issue.title);
      if (typeof issue.description === "string" && issue.description.trim()) bodies.push(issue.description);
      for (const c of comments) {
        if (typeof c.body === "string" && c.body.trim()) bodies.push(c.body);
      }
      const relSet = new Set<string>();
      for (const block of bodies) {
        for (const r of extractRelativeRepoPaths(block)) {
          relSet.add(r);
          if (relSet.size >= MAX_REL_PATHS_PER_ISSUE) break;
        }
        if (relSet.size >= MAX_REL_PATHS_PER_ISSUE) break;
      }

      for (const rel of relSet) {
        const abs = joinWorkspaceRoot(workspaceRoot, rel);
        chunks.push({
          sourceKind: "issue_comment_relative",
          issueId,
          text: "",
          fileHints: [
            {
              path: abs,
              title: fileBasename(rel),
              source: `relative:${rel}`,
            },
          ],
        });
      }
    }
  });

  const contentHash = await stableContentHash(chunks, companyId, projectId);
  return { bundle: chunks, contentHash };
}
