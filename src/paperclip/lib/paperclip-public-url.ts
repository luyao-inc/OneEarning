/**
 * 将存储用的根相对 Paperclip API 路径转为可在当前页面加载的绝对 URL。
 *
 * 桌面壳使用 `file://` 打开页面时，`/api/...` 无法作为图片地址解析；浏览器直连 Paperclip 时
 * 相对路径通常可用，但拼成绝对 URL 后与 `window.location.origin` 一致，行为不变。
 */
export function resolvePaperclipPublicAssetUrl(
  src: string | null | undefined,
  paperclipBaseUrl: string | null | undefined,
): string {
  if (!src) return '';
  const base = paperclipBaseUrl?.trim();
  if (!base || !src.startsWith('/api/')) return src;
  return `${base.replace(/\/$/, '')}${src}`;
}

/** 供 MDX 编辑器等 WYSIWYG 使用：内联图片仍为存储用的 `/api/...`，在桌面壳下需改为绝对 URL 才能加载。 */
export function rewriteMarkdownInlineImageUrlsToAbsolute(
  markdown: string,
  paperclipBaseUrl: string | null | undefined,
): string {
  if (!paperclipBaseUrl?.trim() || !markdown) return markdown;
  return markdown.replace(
    /!\[([^\]]*)\]\(\s*(\/api\/[^)\s]+)(\s+"[^"]*")?\s*\)/g,
    (full, alt, apiPath: string, titlePart: string | undefined) => {
      const abs = resolvePaperclipPublicAssetUrl(apiPath, paperclipBaseUrl);
      return `![${alt}](${abs}${titlePart ?? ''})`;
    },
  );
}

/** 将 `onChange` 里可能出现的同源绝对 URL 还原为根相对路径，便于持久化与网页版一致。 */
export function normalizeMarkdownInlineImageUrlsToRelative(
  markdown: string,
  paperclipBaseUrl: string | null | undefined,
): string {
  if (!paperclipBaseUrl?.trim() || !markdown) return markdown;
  let origin: string;
  try {
    const base = paperclipBaseUrl.endsWith('/') ? paperclipBaseUrl.slice(0, -1) : paperclipBaseUrl;
    origin = new URL(base).origin;
  } catch {
    return markdown;
  }
  return markdown.replace(
    /!\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)(\s+"[^"]*")?\s*\)/g,
    (full, alt, httpUrl: string, titlePart: string | undefined) => {
      try {
        const u = new URL(httpUrl.trim());
        if (u.origin !== origin) return full;
        const rel = `${u.pathname}${u.search}${u.hash}`;
        return `![${alt}](${rel}${titlePart ?? ''})`;
      } catch {
        return full;
      }
    },
  );
}
