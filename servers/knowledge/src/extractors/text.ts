import { readFile } from "node:fs/promises";
import type { ExtractInput, ExtractResult, Extractor } from "./types.js";

/** 常见可读文本/源码后缀（不含 docx，由 DocxExtractor 处理） */
const EXT =
  /\.(md|mdx|txt|text|json|csv|log|ts|tsx|js|jsx|c|cc|cpp|h|hpp|cs|java|kt|go|rs|rb|php|swift|scala|py|vue|svelte|css|scss|less|yml|yaml|toml|xml|html|htm|svg|rst|adoc|asciidoc|tex|bib|cfg|ini|properties|sql|sh|bash|zsh|fish|bat|cmd|ps1|psm1|gradle|dockerfile|gitignore|editorconfig|env)$/i;

export class TextExtractor implements Extractor {
  id = "text";
  version = "1";

  canHandle(input: ExtractInput): boolean {
    if (EXT.test(input.absPath)) return true;
    const m = input.mime.toLowerCase();
    return (
      m.startsWith("text/") ||
      m === "application/json" ||
      m === "application/xml" ||
      m === "application/rtf" ||
      m === "application/javascript" ||
      m === "application/typescript" ||
      m === "application/x-yaml" ||
      m === "application/sql"
    );
  }

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const buf = await readFile(input.absPath);
    let text = stripBom(buf.toString("utf8"));
    const warnings: string[] = [];
    if (!text.trim()) warnings.push("empty_file");
    return { text, warnings: warnings.length ? warnings : undefined };
  }
}

function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}
