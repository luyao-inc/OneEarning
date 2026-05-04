import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function SplashPage() {
  const { t } = useTranslation();
  const [line, setLine] = useState('');
  const showNoBridge =
    import.meta.env.DEV && typeof window !== 'undefined' && window.oneEarning === undefined;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  /** Cursor / VS Code 等基于 Electron，UA 含 Electron 但并非本应用窗口，无 preload */
  const inIdeEmbeddedPreview =
    /\bCursor\/\d/.test(ua) || /\bCode\/\d/.test(ua) || /vscode-webview/i.test(ua);
  const inGenericElectronUa = ua.includes('Electron');

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
          {inIdeEmbeddedPreview ? (
            <p>
              当前在 <strong>Cursor / VS Code 等编辑器的内置预览</strong>中打开了本地地址。此处
              User-Agent 虽含 <code>Electron</code>，但<strong>不是</strong>本项目的独立应用窗口，因此
              不会注入 <code>window.oneEarning</code>。请关闭内置预览，在项目根目录执行{' '}
              <code>pnpm dev</code>，使用<strong>随后自动弹出的 OneEarning</strong>桌面窗口进入应用。
            </p>
          ) : !inGenericElectronUa ? (
            <p>
              当前页面运行在<strong>普通浏览器</strong>里（User-Agent 不含 Electron），因此不会有
              preload。请<strong>不要</strong>用浏览器打开 Vite 地址；在项目根目录执行{' '}
              <code>pnpm dev</code>，使用<strong>随后自动打开的桌面 Electron 窗口</strong>进入应用。
            </p>
          ) : (
            <p>
              已检测到可能是本应用的 Electron 环境，但 <code>window.oneEarning</code> 仍不存在，说明
              preload 可能执行失败或未加载。请查看运行 <code>pnpm dev</code> 的终端里是否有{' '}
              <code>[OneEarning] preload-error</code> 或构建错误；并确认已生成{' '}
              <code>dist-electron/preload/index.cjs</code>。
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
