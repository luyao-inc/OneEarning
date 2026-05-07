/** Markdown-ish heading split + sliding window (chars, approximate). */

const WINDOW = 800;
const OVERLAP = 200;

export interface ChunkPiece {
  chunkIdx: number;
  headingPath: string | null;
  content: string;
}

export function chunkText(fullText: string, sourceHint: string): ChunkPiece[] {
  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const sections = splitByHeadings(normalized);
  const pieces: ChunkPiece[] = [];
  let idx = 0;
  for (const sec of sections) {
    const windowed = slidingWindows(sec.body, WINDOW, OVERLAP);
    for (const w of windowed) {
      pieces.push({
        chunkIdx: idx++,
        headingPath: sec.heading,
        content: w,
      });
    }
  }
  return pieces;
}

function splitByHeadings(text: string): { heading: string | null; body: string }[] {
  const lines = text.split("\n");
  const blocks: { heading: string | null; body: string }[] = [];
  let curHeading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body || curHeading) {
      blocks.push({ heading: curHeading, body: body || "" });
    }
    buf = [];
  };
  for (const line of lines) {
    const hm = /^(#{1,6})\s+(.+)$/.exec(line);
    if (hm) {
      flush();
      curHeading = hm[2]!.trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  if (blocks.length === 0) return [{ heading: null, body: text }];
  return blocks;
}

function slidingWindows(s: string, win: number, overlap: number): string[] {
  if (s.length <= win) return [s];
  const step = Math.max(1, win - overlap);
  const out: string[] = [];
  for (let i = 0; i < s.length; i += step) {
    out.push(s.slice(i, i + win));
    if (i + win >= s.length) break;
  }
  return out;
}
