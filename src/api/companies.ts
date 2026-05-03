import { api } from '@/lib/paperclip-api';

/** 与 Paperclip Company 列表项对齐的最小形状（按需扩展） */
export type CompanyRow = {
  id: string;
  name: string;
  issuePrefix: string;
  status?: string;
  description?: string | null;
};

export type CompanyStats = Record<string, { agentCount: number; issueCount: number }>;

export const companiesApi = {
  list: () => api.get<CompanyRow[]>('/companies'),
  get: (companyId: string) => api.get<CompanyRow>(`/companies/${companyId}`),
  stats: () => api.get<CompanyStats>('/companies/stats'),
  create: (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) =>
    api.post<CompanyRow>('/companies', data),
};
