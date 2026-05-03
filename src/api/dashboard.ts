import { api } from '@/lib/paperclip-api';

/** Dashboard summary（与后端 dashboardService.summary 返回对齐的宽松类型） */
export type DashboardSummary = {
  company?: { id: string; name: string; issuePrefix?: string };
  agentCounts?: Record<string, number>;
  taskCounts?: Record<string, number>;
  pendingApprovals?: number;
  [key: string]: unknown;
};

export const dashboardApi = {
  summary: (companyId: string) =>
    api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
};
