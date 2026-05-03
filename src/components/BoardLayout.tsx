import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useParams } from 'react-router-dom';
import { companiesApi } from '@/api/companies';
import { usePaperclipBaseUrl } from '@/context/PaperclipContext';
import { normalizeCompanyPrefix } from '@/lib/company-routes';

export function BoardLayout() {
  const { t } = useTranslation();
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const baseUrl = usePaperclipBaseUrl();

  const { data: companies, isLoading } = useQuery({
    queryKey: ['paperclip', 'companies'],
    queryFn: () => companiesApi.list(),
  });

  const company = useMemo(() => {
    if (!companies || !companyPrefix) return null;
    const want = normalizeCompanyPrefix(companyPrefix);
    return companies.find((c) => normalizeCompanyPrefix(c.issuePrefix) === want) ?? null;
  }, [companies, companyPrefix]);

  const openFullWeb = () => {
    void window.oneEarning?.openExternalSafe?.(baseUrl);
  };

  if (isLoading) {
    return <div className="page-pad muted">{t('splash.hint')}</div>;
  }

  if (!company) {
    return (
      <div className="page-pad">
        <p className="error-text">{t('errors.unknownCompany')}</p>
        <Link to="/">{t('nav.home')}</Link>
      </div>
    );
  }

  const p = normalizeCompanyPrefix(company.issuePrefix);

  return (
    <div className="shell">
      <aside className="shell-aside">
        <div className="shell-brand">{company.name}</div>
        <nav className="shell-nav">
          <Link className="nav-link" to={`/${p}/dashboard`}>
            {t('nav.dashboard')}
          </Link>
          <Link className="nav-link" to={`/${p}/issues`}>
            {t('nav.issues')}
          </Link>
          <Link className="nav-link" to="/">
            {t('nav.home')}
          </Link>
        </nav>
        <button type="button" className="btn btn-ghost aside-foot" onClick={openFullWeb}>
          {t('nav.openFullWeb')}
        </button>
        <p className="aside-hint muted">{t('escape.hint')}</p>
      </aside>
      <main className="shell-main">
        <Outlet context={{ company }} />
      </main>
    </div>
  );
}
