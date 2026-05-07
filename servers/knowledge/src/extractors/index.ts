import type { ExtractInput, ExtractResult, Extractor } from "./types.js";
import { DocxExtractor } from "./docx.js";
import { TextExtractor } from "./text.js";
import { PdfTextExtractor } from "./pdf.js";
import { AudioStubExtractor } from "./audio.js";
import { VideoStubExtractor } from "./video.js";
import { OcrStubExtractor } from "./ocr.js";

export type { ExtractInput, ExtractResult, Extractor } from "./types.js";

const registry: Extractor[] = [
  new DocxExtractor(),
  new TextExtractor(),
  new PdfTextExtractor(),
  new AudioStubExtractor(),
  new VideoStubExtractor(),
  new OcrStubExtractor(),
];

export function resolveExtractor(input: ExtractInput): Extractor | null {
  for (const ex of registry) {
    if (ex.canHandle(input)) return ex;
  }
  return null;
}
