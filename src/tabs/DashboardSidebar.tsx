import { useState } from 'react';
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Phone,
  PhoneForwarded,
  Radio,
  Users,
  UserPlus,
  History,
} from 'lucide-react';
import type { Permissions, UserRole } from '@/services/types';

interface DashboardSidebarProps {
  selectedTab: string;
  onSelect: (tab: string) => void;
  permissions: Permissions;
  displayName: string;
  currentRole: UserRole;
  onSignOut: () => Promise<void>;
}

const TAB_ITEMS = [
  { key: 'overview',          label: 'Overview',          icon: LayoutDashboard, perm: 'canViewOverviewTab' },
  { key: 'agents',            label: 'Agents',             icon: Users,           perm: 'canViewAgentsTab' },
  { key: 'agent-onboarding',  label: 'Agent Onboarding',   icon: UserPlus,        perm: 'canViewAgentOnboardingTab' },
  { key: 'calls',             label: 'Calls',              icon: Phone,           perm: 'canViewCallsTab' },
  { key: 'sip',               label: 'SIP Lines',          icon: Radio,           perm: 'canViewSipTab' },
  { key: 'clients',           label: 'Clients',            icon: BookOpen,        perm: 'canViewClientsTab' },
  { key: 'did-mappings',      label: 'DID Mappings',       icon: PhoneForwarded,  perm: 'canManageDIDMappings' },
  { key: 'audit-logs',        label: 'Audit Logs',         icon: History,         perm: 'canViewAuditLogs' },
] as const;

export default function DashboardSidebar({
  selectedTab,
  onSelect,
  permissions,
  displayName,
  currentRole,
  onSignOut,
}: DashboardSidebarProps) {
  const [open, setOpen] = useState(true);

  const visibleTabs = TAB_ITEMS.filter((t) => {
    if (!t.perm) return true;
    return permissions[t.perm as keyof Permissions];
  });

  return (
    <nav className="hidden md:flex md:w-64 md:h-full bg-neutral-900 flex-col flex-shrink-0">
      <div className="p-6 border-b border-neutral-800">
        <h1 className="font-bold text-base text-white">Command Center</h1>
      </div>

      <div className="flex-1 p-4 space-y-1 overflow-y-auto">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter') setOpen((v) => !v); }}
          className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm transition cursor-pointer select-none text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <Activity className="h-5 w-5" />
          <span>Dashboard</span>
          <span className="ml-auto opacity-70">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </div>

        {open && (
          <div className="space-y-0.5">
            {visibleTabs.map(({ key, label, icon: Icon }) => {
              const active = selectedTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`ml-3 w-[calc(100%-0.75rem)] flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    active
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-neutral-800 space-y-2">
        <div className="flex items-center space-x-3 px-4 py-2">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-white font-semibold text-xs shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <p className="text-xs text-neutral-400 capitalize">{currentRole.replace('-', ' ')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-sm font-semibold transition border border-neutral-700"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </nav>
  );
}
