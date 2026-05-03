import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { companiesApi } from '@/api/companies';
import { normalizeCompanyPrefix } from '@/lib/company-routes';

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const { data: companies, isLoading } = useQuery({
    queryKey: ['paperclip', 'companies'],
    queryFn: () => companiesApi.list(),
  });

  useEffect(() => {
    if (!companies || companies.length !== 1) return;
    const p = normalizeCompanyPrefix(companies[0]!.issuePrefix);
    navigate(`/${p}/dashboard`, { replace: true });
  }, [companies, navigate]);

  const createMut = useMutation({
    mutationFn: (n: string) => companiesApi.create({ name: n.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['paperclip', 'companies'] });
      setName('');
    },
  });

  if (isLoading) {
    return <div className="page-pad muted">{t('splash.hint')}</div>;
  }

  return (
    <div className="page-pad">
      <h1 className="page-title">{t('home.title')}</h1>
      {companies?.length === 0 ? (
        <p className="muted">{t('home.empty')}</p>
      ) : (
        <ul className="company-grid">
          {companies?.map((c) => {
            const p = normalizeCompanyPrefix(c.issuePrefix);
            return (
              <li key={c.id}>
                <Link className="card-link" to={`/${p}/dashboard`}>
                  <span className="card-name">{c.name}</span>
                  <span className="card-meta">{p}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="create-box">
        <label className="muted" htmlFor="co-name">
          {t('home.nameLabel')}
        </label>
        <div className="create-row">
          <input
            id="co-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder=""
          />
          <button
            type="button"
            className="btn"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate(name)}
          >
            {t('home.create')}
          </button>
        </div>
        {createMut.isError ? (
          <p className="error-text">{createMut.error instanceof Error ? createMut.error.message : String(createMut.error)}</p>
        ) : null}
      </div>
    </div>
  );
}
