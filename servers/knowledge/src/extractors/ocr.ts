import type { ExtractInput, ExtractResult, Extractor } from "./types.js";

export class OcrStubExtractor implements Extractor {
  id = "ocr";
  version = "1";

  canHandle(input: ExtractInput): boolean {
    const m = input.mime.toLowerCase();
    return (
      m.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|bmp|tiff)$/i.test(input.absPath)
    );
  }

  async extract(_input: ExtractInput): Promise<ExtractResult> {
    return { text: "", warnings: ["phase2_ocr_not_implemented"] };
  }
}
