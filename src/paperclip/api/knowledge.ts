import { api } from "./client";

export interface KnowledgeSearchHit {
  docPath: string;
  chunkIdx: number;
  snippet: string;
  score: number;
  tStartMs: number | null;
  tEndMs: number | null;
}

export interface KnowledgeSearchResponse {
  hits: KnowledgeSearchHit[];
}

export interface KnowledgeInfoResponse {
  docCount: number;
  indexedCount: number;
  pendingCount: number;
  failedCount: number;
  unsupportedCount: number;
  indexedAt: number;
  sizeBytes: number;
}

export interface KnowledgeStatusFile {
  path: string;
  kind: string;
  status: string;
  extractorId: string | null;
  error: string | null;
}

export interface KnowledgeStatusResponse {
  files: KnowledgeStatusFile[];
  jobs: Array<{ id: number; kind: string; docPath: string | null; status: string; error: string | null }>;
}

export interface ReindexResponse {
  enqueued: number;
  processedSync: number;
  summary: {
    scanned: number;
    processed: number;
    skipped: number;
    failed: number;
    unsupported: number;
  };
}

export const knowledgeApi = {
  reindex: (body: { companyId: string; agentId: string }) =>
    api.post<ReindexResponse>("/oneearning/knowledge/reindex", body),

  indexFile: (body: { companyId: string; agentId: string; relPath: string }) =>
    api.post<{ ok: boolean }>("/oneearning/knowledge/index-file", body),

  reextract: (body: { companyId: string; agentId: string; relPath: string }) =>
    api.post<{ ok: boolean }>("/oneearning/knowledge/reextract", body),

  removeFromIndex: (body: { companyId: string; agentId: string; relPath: string }) =>
    api.post<{ ok: boolean }>("/oneearning/knowledge/remove-file", body),

  search: (body: { companyId: string; agentId: string; q: string; topK?: number }) =>
    api.post<KnowledgeSearchResponse>("/oneearning/knowledge/search", body),

  info: (companyId: string, agentId: string) =>
    api.get<KnowledgeInfoResponse>(
      `/oneearning/knowledge/info?companyId=${encodeURIComponent(companyId)}&agentId=${encodeURIComponent(agentId)}`,
    ),

  status: (companyId: string, agentId: string) =>
    api.get<KnowledgeStatusResponse>(
      `/oneearning/knowledge/status?companyId=${encodeURIComponent(companyId)}&agentId=${encodeURIComponent(agentId)}`,
    ),
};
