import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateStatusPayload } from '@electron/shared/update-ipc';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setUiLocale, type UiLocale } from './i18n';

/** 与 `DialogContent`（如「添加技能来源」）一致的卡片容器 */
function AuxDialogPanel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'w-full max-w-md rounded-lg border border-border bg-background p-6 text-foreground shadow-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

function UpdateSection() {
  const { t } = useTranslation();
  const [currentVersion, setCurrentVersion] = useState('');
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);

  useEffect(() => {
    void window.oneEarning?.getAppVersion?.().then(setCurrentVersion).catch(() => setCurrentVersion(''));
    const unsub = window.oneEarning?.onUpdateStatus?.((p) => setStatus(p));
    return () => unsub?.();
  }, []);

  const phase = status?.phase ?? 'idle';
  const pv = Math.round(status?.percent ?? 0);

  let statusText = '';
  if (phase === 'checking') statusText = t('update.checking');
  else if (phase === 'available')
    statusText = t('update.available', { version: status?.availableVersion ?? '…' });
  else if (phase === 'not-available')
    statusText =
      status?.errorMessage && status.errorMessage.length > 0
        ? status.errorMessage
        : t('update.notAvailable');
  else if (phase === 'downloading')
    statusText = `${t('update.downloading')} ${t('update.downloadProgress', { percent: pv })}`;
  else if (phase === 'downloaded') statusText = t('update.downloaded');
  else if (phase === 'error') statusText = status?.errorMessage ?? t('update.error');

  const busy = phase === 'checking' || phase === 'downloading';
  const showStatus = phase !== 'idle' || Boolean(status?.errorMessage);

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-6">
      <div className="text-sm font-semibold leading-none">{t('update.sectionTitle')}</div>
      <p className="text-sm text-muted-foreground">
        {t('update.currentVersion')}: <span className="font-medium text-foreground">{currentVersion || '—'}</span>
      </p>
      {showStatus ? <p className="text-sm text-muted-foreground">{t('update.statusLabel')}: {statusText}</p> : null}
      {phase === 'downloading' ? (
        <progress
          max={100}
          value={pv}
          className="h-1.5 w-full overflow-hidden rounded-full border-0 bg-muted [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void window.oneEarning?.checkUpdates?.()}>
          {t('update.check')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || phase !== 'available'}
          onClick={() => void window.oneEarning?.downloadUpdate?.()}
        >
          {t('update.download')}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={phase !== 'downloaded'}
          onClick={() => void window.oneEarning?.quitAndInstall?.()}
        >
          {t('update.restartInstall')}
        </Button>
      </div>
    </div>
  );
}

export function AboutAuxPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center md:items-center">
      <AuxDialogPanel>
        <h1 className="text-lg font-semibold leading-none">{t('about.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('about.body')}</p>
        <UpdateSection />
      </AuxDialogPanel>
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
    <div className="flex min-h-0 flex-1 flex-col items-stretch">
      <AuxDialogPanel className="flex max-h-[calc(100dvh-120px)] max-w-2xl flex-1 flex-col">
        <h2 className="text-lg font-semibold leading-none">{t('service.title')}</h2>
        <UpdateSection />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void window.oneEarning?.restartPaperclip?.()}>
            {t('service.restart')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.oneEarning?.openDataDir?.()}>
            {t('service.openData')}
          </Button>
        </div>
        <pre className="mt-4 min-h-[200px] flex-1 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground">
          {log || t('service.loading')}
        </pre>
      </AuxDialogPanel>
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
    <div className="flex min-h-0 flex-1 items-start justify-center md:items-center">
      <AuxDialogPanel>
        <h1 className="text-lg font-semibold leading-none">{t('settings.title')}</h1>
        <UpdateSection />
        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <span className="text-sm text-muted-foreground">{t('settings.language')}</span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={locale === 'zh-CN' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUiLocale('zh-CN')}
            >
              {t('settings.zh')}
            </Button>
            <Button type="button" variant={locale === 'en' ? 'default' : 'outline'} size="sm" onClick={() => setUiLocale('en')}>
              {t('settings.en')}
            </Button>
          </div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t('settings.pathHint')}</p>
        <code className="mt-2 block w-full overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">{path}</code>
        <div className="mt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => window.oneEarning?.openDataDir?.()}>
            {t('settings.openExplorer')}
          </Button>
        </div>
      </AuxDialogPanel>
    </div>
  );
}
