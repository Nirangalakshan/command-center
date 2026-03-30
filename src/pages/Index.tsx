import { useAuth } from '@/hooks/useAuth';
import DashboardPage from './DashboardPage';
import LoginPage from './LoginPage';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';

const Index = () => {
  const { user, session, permissions, loading, signIn, signOut } = useAuth();

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
    <DashboardErrorBoundary>
      <DashboardPage session={session} permissions={permissions} onSignOut={signOut} />
    </DashboardErrorBoundary>
  );
};

export default Index;
