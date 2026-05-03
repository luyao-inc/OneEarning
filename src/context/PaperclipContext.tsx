import { createContext, useContext } from 'react';

const PaperclipUrlContext = createContext<string | null>(null);

export function PaperclipUrlProvider({ baseUrl, children }: { baseUrl: string; children: React.ReactNode }) {
  return <PaperclipUrlContext.Provider value={baseUrl}>{children}</PaperclipUrlContext.Provider>;
}

export function usePaperclipBaseUrl(): string {
  const v = useContext(PaperclipUrlContext);
  if (!v) throw new Error('PaperclipUrlProvider missing');
  return v;
}
