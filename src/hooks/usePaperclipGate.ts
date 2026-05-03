import { useEffect, useState } from 'react';

export type PaperclipGateState =
  | { ready: false; baseUrl: null }
  | { ready: true; baseUrl: string };

function isValidBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    return Number(port) > 0;
  } catch {
    return false;
  }
}

export function usePaperclipGate(): PaperclipGateState {
  const [state, setState] = useState<PaperclipGateState>({ ready: false, baseUrl: null });

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const applyReady = (baseUrl: string) => {
      if (cancelled || !isValidBaseUrl(baseUrl)) return;
      setState({ ready: true, baseUrl });
    };

    unsub = window.oneEarning?.onPaperclipReady?.(({ baseUrl }) => {
      applyReady(baseUrl);
    });

    window.oneEarning?.signalShellReady?.();

    void window.oneEarning
      ?.getPaperclipBaseUrl?.()
      .then((url) => {
        if (url && isValidBaseUrl(url)) {
          setState((s) => (s.ready ? s : { ready: true, baseUrl: url }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return state;
}
