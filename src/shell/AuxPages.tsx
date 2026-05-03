import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setUiLocale, type UiLocale } from './i18n';

export function AboutAuxPage() {
  const { t } = useTranslation();
  return (
    <div className="page-pad">
      <h1 className="page-title">{t('about.title')}</h1>
      <p>{t('about.body')}</p>
    </div>
  );
}

export function ServiceAuxPage() {
  const { t } = useTranslation();
  const [log, setLog] = useState('');

  useEffect(() => {
    void window.oneEarning?.getServiceLog?.().then(setLog).catch(() => setLog(t('service.logError')));
  }, [t]);

  return (
    <div className="page-pad page-fill">
      <h2 className="page-title">{t('service.title')}</h2>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => void window.oneEarning?.restartPaperclip?.()}>
          {t('service.restart')}
        </button>
        <button type="button" className="btn" onClick={() => window.oneEarning?.openDataDir?.()}>
          {t('service.openData')}
        </button>
        <button type="button" className="btn" onClick={() => void window.oneEarning?.checkUpdates?.()}>
          {t('service.checkUpdates')}
        </button>
      </div>
      <pre className="log-pre">{log || t('service.loading')}</pre>
    </div>
  );
}

export function SettingsAuxPage() {
  const { t, i18n } = useTranslation();
  const [path, setPath] = useState('…');

  useEffect(() => {
    void window.oneEarning?.getDataDir?.().then(setPath);
  }, []);

  const locale = (i18n.language === 'en' ? 'en' : 'zh-CN') as UiLocale;

  return (
    <div className="page-pad">
      <h1 className="page-title">{t('settings.title')}</h1>
      <div className="field-block">
        <span className="muted">{t('settings.language')}</span>
        <div className="btn-row">
          <button
            type="button"
            className={locale === 'zh-CN' ? 'btn' : 'btn btn-ghost'}
            onClick={() => setUiLocale('zh-CN')}
          >
            {t('settings.zh')}
          </button>
          <button
            type="button"
            className={locale === 'en' ? 'btn' : 'btn btn-ghost'}
            onClick={() => setUiLocale('en')}
          >
            {t('settings.en')}
          </button>
        </div>
      </div>
      <p className="muted">{t('settings.pathHint')}</p>
      <code className="path-code">{path}</code>
      <p>
        <button type="button" className="btn" onClick={() => window.oneEarning?.openDataDir?.()}>
          {t('settings.openExplorer')}
        </button>
      </p>
    </div>
  );
}
