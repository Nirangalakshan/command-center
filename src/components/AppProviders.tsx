import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DashboardDataProvider } from '@/context/DashboardDataContext';
import { CallNotificationProvider } from '@/context/CallNotificationContext';
import { GlobalCallMonitor } from '@/components/dashboard/GlobalCallMonitor';
import LoginPage from '@/pages/LoginPage';

import { GlobalSoftphone } from './dashboard/GlobalSoftphone';

export function AppProviders({ children }: { children: ReactNode }) {
  const { user, session, loading, signIn } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#8a99ad' }}>Loading...</div>
      </div>
    );
  }

  if (!user || !session) {
    return <LoginPage onSignIn={signIn} />;
  }

  return (
    <DashboardDataProvider session={session}>
      <CallNotificationProvider>
        <GlobalCallMonitor />
        <GlobalSoftphone session={session} />
        {children}
      </CallNotificationProvider>
    </DashboardDataProvider>
  );
}
