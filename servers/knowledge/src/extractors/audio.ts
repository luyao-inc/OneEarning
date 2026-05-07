import type { ExtractInput, ExtractResult, Extractor } from "./types.js";

export class AudioStubExtractor implements Extractor {
  id = "audio";
  version = "1";

  canHandle(input: ExtractInput): boolean {
    const m = input.mime.toLowerCase();
    return m.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(input.absPath);
  }

  async extract(_input: ExtractInput): Promise<ExtractResult> {
    return { text: "", warnings: ["phase2_audio_not_implemented"] };
  }
}
