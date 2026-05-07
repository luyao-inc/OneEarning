export interface ExtractInput {
  absPath: string;
  mime: string;
  size: number;
}

export interface ExtractResult {
  text: string;
  language?: string;
  warnings?: string[];
  meta?: Record<string, unknown>;
}

export interface Extractor {
  id: string;
  version: string;
  canHandle(input: ExtractInput): boolean;
  extract(input: ExtractInput): Promise<ExtractResult>;
}
