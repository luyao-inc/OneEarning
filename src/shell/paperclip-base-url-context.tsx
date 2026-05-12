import { createContext, useContext, type ReactNode } from 'react';

const PaperclipBaseUrlContext = createContext<string | null>(null);

export function PaperclipBaseUrlProvider({
  baseUrl,
  children,
}: {
  baseUrl: string;
  children: ReactNode;
}) {
  return (
    <PaperclipBaseUrlContext.Provider value={baseUrl}>{children}</PaperclipBaseUrlContext.Provider>
  );
}

/** Paperclip HTTP 根地址（如 `http://127.0.0.1:38473`）；仅 Electron 壳在 Gate 就绪后可用。 */
export function usePaperclipBaseUrl(): string | null {
  return useContext(PaperclipBaseUrlContext);
}
