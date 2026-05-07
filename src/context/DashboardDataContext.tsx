import React, { createContext, useContext, ReactNode } from 'react';
import { useDashboardData, DashboardData } from '@/hooks/useDashboardData';
import { UserSession } from '@/services/types';

const DashboardDataContext = createContext<DashboardData | undefined>(undefined);

export function DashboardDataProvider({ 
  session, 
  children 
}: { 
  session: UserSession | null; 
  children: ReactNode;
}) {
  const data = useDashboardData({ session });

  return (
    <DashboardDataContext.Provider value={data}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardDataContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardDataProvider');
  }
  return context;
}
