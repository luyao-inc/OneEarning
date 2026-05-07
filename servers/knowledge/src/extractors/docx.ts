import mammoth from "mammoth";
import type { ExtractInput, ExtractResult, Extractor } from "./types.js";

/** Word OOXML（.docx）；旧版二进制 .doc 需其它引擎，此处不认作可处理。 */
export class DocxExtractor implements Extractor {
  id = "docx";
  version = "1";

  canHandle(input: ExtractInput): boolean {
    if (/\.docx$/i.test(input.absPath)) return true;
    const m = input.mime.toLowerCase();
    return m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const result = await mammoth.extractRawText({ path: input.absPath });
    const text = result.value ?? "";
    const warnings: string[] = [];
    for (const msg of result.messages ?? []) {
      warnings.push(typeof msg.message === "string" ? msg.message : String(msg));
    }
    if (!text.trim()) warnings.push("empty_or_unreadable");
    return { text, warnings: warnings.length ? warnings : undefined };
  }
}
