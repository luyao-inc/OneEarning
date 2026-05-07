/**
 * 从 SKILL.md 中尝试得到 Paperclip 可吃的 GitHub 仓库/子路径 URL。
 * 与 Paperclip `parseGitHubSourceUrl` / skills 元数据习惯对齐（含 skills.sh 类 frontmatter）。
 */

const GITHUB_RE = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:tree|blob)\/[^/\s]+(?:\/[^\s)]+)?)?/g;

function firstFrontmatterBlock(md: string): string | null {
  if (!md.startsWith("---\n") && !md.startsWith("---\r\n")) return null;
  const end = md.indexOf("\n---", 3);
  if (end === -1) return null;
  return md.slice(3, end);
}

export function extractGithubImportSource(skillMd: string): string | null {
  // 1) 任意显式 https://github.com/...（取第一个像仓库或 tree 的）
  const matches = skillMd.match(GITHUB_RE);
  if (matches?.length) {
    for (const m of matches) {
      try {
        const u = new URL(m);
        if (u.hostname.toLowerCase() === "github.com" && u.pathname.split("/").filter(Boolean).length >= 2) {
          return m.split("?")[0]!.split("#")[0]!;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 2) frontmatter: metadata.sources / sources 中的 repo: owner/name
  const fm = firstFrontmatterBlock(skillMd);
  if (fm) {
    const repoLine = fm.match(/^\s*repo:\s*['"]?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)['"]?\s*$/m);
    if (repoLine?.[1]) {
      return `https://github.com/${repoLine[1]}`;
    }
  }

  return null;
}
