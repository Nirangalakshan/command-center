import { useAuth } from '@/hooks/useAuth';
import DashboardPage from './DashboardPage';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';

const Index = () => {
  const { session, permissions, signOut } = useAuth();

  // session check is now handled by AppProviders
  if (!session) return null;

  return (
    <DashboardErrorBoundary>
      <DashboardPage session={session} permissions={permissions} onSignOut={signOut} />
    </DashboardErrorBoundary>
  );
};

export default Index;
