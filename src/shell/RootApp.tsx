import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from '@/lib/router';
import { App } from '@/App';
import { CompanyProvider } from '@/context/CompanyContext';
import { LiveUpdatesProvider } from '@/context/LiveUpdatesProvider';
import { BreadcrumbProvider } from '@/context/BreadcrumbContext';
import { PanelProvider } from '@/context/PanelContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { DialogProvider } from '@/context/DialogContext';
import { EditorAutocompleteProvider } from '@/context/EditorAutocompleteContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initPluginBridge } from '@/plugins/bridge-init';
import { PluginLauncherProvider } from '@/plugins/launchers';
import { usePaperclipGate } from './usePaperclipGate';
import { SplashPage } from './SplashPage';

initPluginBridge(React, ReactDOM);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

function PaperclipTree() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <CompanyProvider>
            <EditorAutocompleteProvider>
              <ToastProvider>
                <LiveUpdatesProvider>
                  <TooltipProvider>
                    <BreadcrumbProvider>
                      <SidebarProvider>
                        <PanelProvider>
                          <PluginLauncherProvider>
                            <DialogProvider>
                              <App />
                            </DialogProvider>
                          </PluginLauncherProvider>
                        </PanelProvider>
                      </SidebarProvider>
                    </BreadcrumbProvider>
                  </TooltipProvider>
                </LiveUpdatesProvider>
              </ToastProvider>
            </EditorAutocompleteProvider>
          </CompanyProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function GateShell() {
  const gate = usePaperclipGate();
  if (!gate.ready) {
    return <SplashPage />;
  }
  return <PaperclipTree />;
}

export function RootApp() {
  return (
    <StrictMode>
      <GateShell />
    </StrictMode>
  );
}
