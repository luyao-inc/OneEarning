import { createRoot } from 'react-dom/client';
import { installPaperclipFetchBridge } from './fetch-bridge';
import './shell.css';
import './i18n';
import '@mdxeditor/editor/style.css';
import '../paperclip/index.css';
import { AboutAuxPage, ServiceAuxPage, SettingsAuxPage } from './AuxPages';
import { ShellAuxFrame } from './ShellAuxFrame';
import { RootApp } from './RootApp';

function getAuxRoute(): 'about' | 'service' | 'settings' | null {
  const q = new URLSearchParams(window.location.search).get('route');
  if (q === 'about' || q === 'service' || q === 'settings') return q;
  return null;
}

installPaperclipFetchBridge();

const aux = getAuxRoute();
const rootEl = document.getElementById('root')!;

if (aux === 'about') {
  createRoot(rootEl).render(
    <ShellAuxFrame>
      <AboutAuxPage />
    </ShellAuxFrame>,
  );
} else if (aux === 'service') {
  createRoot(rootEl).render(
    <ShellAuxFrame>
      <ServiceAuxPage />
    </ShellAuxFrame>,
  );
} else if (aux === 'settings') {
  createRoot(rootEl).render(
    <ShellAuxFrame>
      <SettingsAuxPage />
    </ShellAuxFrame>,
  );
} else {
  const skipServiceWorker =
    window.location.protocol === 'file:' || typeof window.oneEarning !== 'undefined';
  if (!skipServiceWorker && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    });
  }
  createRoot(rootEl).render(<RootApp />);
}
