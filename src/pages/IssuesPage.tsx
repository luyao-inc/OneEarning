import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router-dom';
import type { CompanyRow } from '@/api/companies';
import { issuesApi } from '@/api/issues';
import { normalizeCompanyPrefix } from '@/lib/company-routes';

export function IssuesPage() {
  const { t } = useTranslation();
  const { company } = useOutletContext<{ company: CompanyRow }>();
  const p = normalizeCompanyPrefix(company.issuePrefix);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: ['paperclip', 'issues', company.id],
    queryFn: () => issuesApi.list(company.id, { limit: 100 }),
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

  return (
    <div className="page-pad">
      <h1 className="page-title">{t('issues.title')}</h1>
      {!issues?.length ? (
        <p className="muted">{t('issues.empty')}</p>
      ) : (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue.id} className="issue-row">
              <Link className="issue-link" to={`/${p}/issues/${issue.id}`}>
                <span className="issue-title">{issue.title}</span>
                <span className="issue-status muted">{issue.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
