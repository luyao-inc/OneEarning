import { Navigate, Route, Routes } from 'react-router-dom';
import { BoardLayout } from '@/components/BoardLayout';
import { PaperclipUrlProvider } from '@/context/PaperclipContext';
import { usePaperclipGate } from '@/hooks/usePaperclipGate';
import { AboutAuxPage, ServiceAuxPage, SettingsAuxPage } from '@/pages/AuxPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { HomePage } from '@/pages/HomePage';
import { IssueDetailPage } from '@/pages/IssueDetailPage';
import { IssuesPage } from '@/pages/IssuesPage';
import { SplashPage } from '@/pages/SplashPage';

function getAuxRoute(): 'about' | 'service' | 'settings' | null {
  const q = new URLSearchParams(window.location.search).get('route');
  if (q === 'about' || q === 'service' || q === 'settings') return q;
  return null;
}

export default function App() {
  const aux = getAuxRoute();
  if (aux === 'about') return <AboutAuxPage />;
  if (aux === 'service') return <ServiceAuxPage />;
  if (aux === 'settings') return <SettingsAuxPage />;

  return <MainShell />;
}

function MainShell() {
  const gate = usePaperclipGate();
  if (!gate.ready) return <SplashPage />;
  return (
    <PaperclipUrlProvider baseUrl={gate.baseUrl}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:companyPrefix" element={<BoardLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="issues/:issueId" element={<IssueDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PaperclipUrlProvider>
  );
}
