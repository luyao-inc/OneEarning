import { api } from '@/lib/paperclip-api';

export type HealthStatus = {
  status: 'ok';
  version?: string;
  deploymentMode?: 'local_trusted' | 'authenticated';
  deploymentExposure?: 'private' | 'public';
  authReady?: boolean;
  bootstrapStatus?: 'ready' | 'bootstrap_pending';
  bootstrapInviteActive?: boolean;
};

export const healthApi = {
  get: () => api.get<HealthStatus>('/health'),
};
