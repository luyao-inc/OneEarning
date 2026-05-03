import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SplashPage() {
  const { t } = useTranslation();
  const [line, setLine] = useState('');
  const showNoBridge =
    import.meta.env.DEV && typeof window !== 'undefined' && window.oneEarning === undefined;
  const inElectron =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

  useEffect(() => {
    const off = window.oneEarning?.onServerStatus?.((s) => setLine(s.message));
    return () => {
      off?.();
    };
  }, []);

  return (
    <div className="splash">
      <div className="splash-title">{t('splash.title')}</div>
      <div className="splash-hint">{line || t('splash.hint')}</div>
      {showNoBridge ? (
        <div className="splash-dev-warn">
          <div className="splash-dev-warn-title">【开发态诊断】未检测到 window.oneEarning（preload 未注入）</div>
          {!inElectron ? (
            <p>
              当前页面运行在<strong>普通浏览器</strong>里（User-Agent 不含 Electron），因此不会有
              preload。请<strong>不要</strong>用浏览器打开 Vite 地址；在项目根目录执行{' '}
              <code>pnpm dev</code>，使用<strong>随后自动打开的桌面 Electron 窗口</strong>进入应用。
            </p>
          ) : (
            <p>
              已检测到 Electron 环境，但 <code>window.oneEarning</code> 仍不存在，说明 preload
              可能执行失败或未加载。请查看运行 <code>pnpm dev</code> 的终端里是否有{' '}
              <code>[OneEarning] preload-error</code> 或构建错误；并确认已生成{' '}
              <code>dist-electron/preload/index.cjs</code>。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
