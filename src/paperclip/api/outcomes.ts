import { api } from "./client";

export interface OutcomesBundleChunk {
  sourceKind: string;
  issueId?: string | null;
  text: string;
  truncated?: boolean;
  /** @deprecated 已不再从语料扫链接；保留字段以兼容旧侧车 */
  structuredHints?: Array<{ url?: string; title?: string; type?: string } | null | undefined>;
  /** 结构化文件路径（附件 / 非 http 的 Work Product），由侧车校验磁盘上为文件且非目录 */
  fileHints?: Array<{
    path: string;
    title?: string | null;
    attachmentId?: string;
    source?: string;
  }>;
}

export interface OutcomesIngestResponse {
  ok: boolean;
  skipped?: boolean;
  contentHash?: string;
  itemCount?: number;
}

export interface OutcomeItemRow {
  kind: string;
  canonical: string;
  title: string | null;
  snippet: string;
  workProductType: string | null;
  sourceRefs: unknown;
  displayKind: string;
  createdAt: number;
  updatedAt: number;
}

export const outcomesApi = {
  ingest: (body: {
    companyId: string;
    projectId: string;
    contentHash?: string;
    bundle: OutcomesBundleChunk[];
  }) => api.post<OutcomesIngestResponse>("/oneearning/outcomes/ingest", body),

  items: (companyId: string, projectId: string) =>
    api.get<{ items: OutcomeItemRow[]; contentHash: string | null }>(
      `/oneearning/outcomes/items?companyId=${encodeURIComponent(companyId)}&projectId=${encodeURIComponent(projectId)}`,
    ),
};
