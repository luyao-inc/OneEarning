import { useEffect, type ReactNode } from 'react';
/**
 * 辅助窗口根布局：启用与主应用一致的深色主题变量，并为系统标题栏/交通灯留出内边距。
 */
export function ShellAuxFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-oneearning-aux', '1');
    return () => {
      document.documentElement.classList.remove('dark');
      document.documentElement.removeAttribute('data-oneearning-aux');
    };
  }, []);

  const isMac =
    typeof navigator !== 'undefined' &&
    (/Macintosh|Mac OS X/.test(navigator.userAgent) || navigator.userAgent.includes('Mac'));

  return (
    <div
      className="flex min-h-dvh flex-col bg-background text-foreground"
      style={{
        boxSizing: 'border-box',
        paddingTop: isMac ? 28 : 'max(32px, env(titlebar-area-height, 40px))',
        paddingLeft: isMac ? 76 : 20,
        paddingRight: 20,
        paddingBottom: 20,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
