import { api } from '@/lib/paperclip-api';

export type IssueRow = {
  id: string;
  title: string;
  status: string;
  companyId?: string;
  issuePath?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
};

export const issuesApi = {
  list: (companyId: string, filters?: { limit?: number; offset?: number; status?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.q) params.set('q', filters.q);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
    const qs = params.toString();
    return api.get<IssueRow[]>(`/companies/${companyId}/issues${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api.get<IssueRow>(`/issues/${id}`),
};
