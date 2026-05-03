import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { issuesApi } from '@/api/issues';
import { normalizeCompanyPrefix } from '@/lib/company-routes';

export function IssueDetailPage() {
  const { t } = useTranslation();
  const { companyPrefix, issueId } = useParams<{ companyPrefix: string; issueId: string }>();
  const p = companyPrefix ? normalizeCompanyPrefix(companyPrefix) : '';

  const { data: issue, isLoading, error } = useQuery({
    queryKey: ['paperclip', 'issue', issueId],
    queryFn: () => issuesApi.get(issueId!),
    enabled: Boolean(issueId),
  });

  if (isLoading) {
    return <div className="page-pad muted">{t('splash.hint')}</div>;
  }

  if (error || !issue) {
    return (
      <div className="page-pad">
        <p className="error-text">{error instanceof Error ? error.message : t('issues.empty')}</p>
        <Link to={`/${p}/issues`}>{t('issue.back')}</Link>
      </div>
    );
  }

  return (
    <div className="page-pad">
      <p>
        <Link to={`/${p}/issues`}>{t('issue.back')}</Link>
      </p>
      <h1 className="page-title">{issue.title}</h1>
      <p className="muted">
        {issue.status} · {issue.id}
      </p>
      <pre className="code-block">{JSON.stringify(issue, null, 2)}</pre>
    </div>
  );
}
