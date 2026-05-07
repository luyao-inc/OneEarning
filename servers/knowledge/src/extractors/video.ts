import type { ExtractInput, ExtractResult, Extractor } from "./types.js";

export class VideoStubExtractor implements Extractor {
  id = "video";
  version = "1";

  canHandle(input: ExtractInput): boolean {
    const m = input.mime.toLowerCase();
    return m.startsWith("video/") || /\.(mp4|mkv|mov|webm|avi)$/i.test(input.absPath);
  }

  async extract(_input: ExtractInput): Promise<ExtractResult> {
    return { text: "", warnings: ["phase2_video_not_implemented"] };
  }
}
