import type { Permissions, TabDef } from '@/services/types';

interface DashboardTabsProps {
  tabs: TabDef[];
  selectedTab: string;
  onSelect: (key: string) => void;
  permissions: Permissions;
}

/** Filter and render tabs based on role permissions */
export function DashboardTabs({ tabs, selectedTab, onSelect, permissions }: DashboardTabsProps) {
  const visibleTabs = tabs.filter((t) => {
    if (t.key === 'overview') return permissions.canViewOverviewTab;
    if (t.key === 'agents') return permissions.canViewAgentsTab;
    if (t.key === 'calls') return permissions.canViewCallsTab;
    if (t.key === 'sip') return permissions.canViewSipTab;
    if (t.key === 'clients') return permissions.canViewClientsTab;
    return false;
  });

  return (
    <div className="cc-tabs">
      {visibleTabs.map((t) => (
        <button
          key={t.key}
          className={`cc-tab ${selectedTab === t.key ? 'cc-tab-active' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          <span className="cc-tab-icon">{t.icon}</span>
          {t.label.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
