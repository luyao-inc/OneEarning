import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { ExtractInput, ExtractResult, Extractor } from "./types.js";

const require = createRequire(import.meta.url);

const MIN_CHARS_FOR_TEXT_LAYER = 50;

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string } | unknown> }>;
  }>;
}

export class PdfTextExtractor implements Extractor {
  id = "pdf";
  version = "1";

  canHandle(input: ExtractInput): boolean {
    return /\.pdf$/i.test(input.absPath) || input.mime.toLowerCase().includes("pdf");
  }

  async extract(input: ExtractInput): Promise<ExtractResult> {
    const data = new Uint8Array(await readFile(input.absPath));
    const pdfPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = (await import(pdfPath)) as {
      getDocument: (opts: {
        data: Uint8Array;
        useSystemFonts?: boolean;
        verbosity?: number;
      }) => { promise: Promise<PdfDoc> };
    };
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      verbosity: 0,
    });
    const pdf = await loadingTask.promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) =>
          typeof item === "object" && item !== null && "str" in item
            ? String((item as { str?: string }).str ?? "")
            : "",
        )
        .join(" ");
      parts.push(line);
    }
    const text = parts.join("\n").replace(/\s+/g, " ").trim();
    const warnings: string[] = [];
    if (text.length < MIN_CHARS_FOR_TEXT_LAYER) {
      warnings.push("no_text_layer");
    }
    return {
      text,
      meta: { pages: pdf.numPages },
      warnings: warnings.length ? warnings : undefined,
    };
  }
}
