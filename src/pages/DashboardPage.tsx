import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router-dom';
import { dashboardApi } from '@/api/dashboard';
import type { CompanyRow } from '@/api/companies';

export function DashboardPage() {
  const { t } = useTranslation();
  const { company } = useOutletContext<{ company: CompanyRow }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['paperclip', 'dashboard', company.id],
    queryFn: () => dashboardApi.summary(company.id),
  });

  if (isLoading) {
    return <div className="page-pad muted">{t('splash.hint')}</div>;
  }

  if (error) {
    return (
      <div className="page-pad">
        <p className="error-text">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }

  const agents = data?.agents as Record<string, number> | undefined;
  const tasks = data?.tasks as Record<string, number> | undefined;
  const costs = data?.costs as { monthSpendCents?: number; monthBudgetCents?: number } | undefined;

  return (
    <div className="page-pad">
      <h1 className="page-title">{t('dashboard.title')}</h1>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">{t('dashboard.agents')}</div>
          <pre className="stat-pre">{agents ? JSON.stringify(agents, null, 2) : '—'}</pre>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('dashboard.tasks')}</div>
          <pre className="stat-pre">{tasks ? JSON.stringify(tasks, null, 2) : '—'}</pre>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('dashboard.costs')}</div>
          <div className="stat-value">
            {costs?.monthSpendCents != null ? `${(costs.monthSpendCents / 100).toFixed(2)}` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{t('dashboard.approvals')}</div>
          <div className="stat-value">{data?.pendingApprovals ?? '—'}</div>
        </div>
      </div>
      {Array.isArray(data?.runActivity) && data.runActivity.length > 0 ? (
        <section className="mt-section">
          <h2 className="section-title">{t('dashboard.runActivity')}</h2>
          <pre className="code-block">{JSON.stringify(data.runActivity, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
