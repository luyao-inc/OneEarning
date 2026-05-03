import { useEffect, useState } from 'react';

type Route = 'splash' | 'about' | 'service' | 'settings';

function getRoute(): Route {
  const q = new URLSearchParams(window.location.search).get('route');
  if (q === 'about' || q === 'service' || q === 'settings') return q;
  return 'splash';
}

export default function App() {
  const [route] = useState<Route>(getRoute);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    if (route !== 'splash') return;
    const off = window.oneEarning?.onServerStatus?.((s) => {
      setStatus(s.message);
    });
    return () => {
      off?.();
    };
  }, [route]);

  if (route === 'about') {
    return (
      <div style={{ padding: 24, maxWidth: 420 }}>
        <h1>关于 OneEarning</h1>
        <p>基于 Paperclip 的桌面封装，界面中文由运行时词典注入。</p>
        <p style={{ opacity: 0.75, fontSize: 14 }}>版本可在主进程关于菜单中查看。</p>
      </div>
    );
  }

  if (route === 'service') {
    return <ServicePanel />;
  }

  if (route === 'settings') {
    return <SettingsPanel />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 16,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 600 }}>正在启动 Paperclip 服务…</div>
      <div style={{ opacity: 0.8, textAlign: 'center', maxWidth: 360, fontSize: 14 }}>
        {status || '请稍候，首次启动可能需要初始化数据库。'}
      </div>
    </div>
  );
}

function ServicePanel() {
  const [log, setLog] = useState<string>('加载中…');

  useEffect(() => {
    void window.oneEarning?.getServiceLog?.().then(setLog).catch(() => setLog('无法读取日志'));
  }, []);

  return (
    <div style={{ padding: 16, height: '100vh', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0 }}>服务状态</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void window.oneEarning?.restartPaperclip?.()}
          style={{ padding: '8px 14px', cursor: 'pointer' }}
        >
          重启服务
        </button>
        <button type="button" onClick={() => window.oneEarning?.openDataDir?.()} style={{ padding: '8px 14px', cursor: 'pointer' }}>
          打开数据目录
        </button>
        <button type="button" onClick={() => void window.oneEarning?.checkUpdates?.()} style={{ padding: '8px 14px', cursor: 'pointer' }}>
          检查更新
        </button>
      </div>
      <pre
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#161b22',
          padding: 12,
          borderRadius: 8,
          fontSize: 12,
          margin: 0,
        }}
      >
        {log}
      </pre>
    </div>
  );
}

function SettingsPanel() {
  const [path, setPath] = useState('…');

  useEffect(() => {
    void window.oneEarning?.getDataDir?.().then(setPath);
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ marginTop: 0 }}>数据与存储</h1>
      <p>Paperclip 数据目录（--data-dir）：</p>
      <code style={{ wordBreak: 'break-all', display: 'block', background: '#161b22', padding: 12, borderRadius: 8 }}>{path}</code>
      <p style={{ marginTop: 16 }}>
        <button type="button" onClick={() => window.oneEarning?.openDataDir?.()} style={{ padding: '8px 14px', cursor: 'pointer' }}>
          在资源管理器中打开
        </button>
      </p>
    </div>
  );
}
