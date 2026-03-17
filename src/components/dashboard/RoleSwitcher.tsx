import type { UserRole } from '@/services/types';
import { ALL_MOCK_SESSIONS } from '@/services/mockSession';

interface RoleSwitcherProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  'super-admin': '⚡ Super Admin',
  'client-admin': '🏢 Client Admin',
  'agent': '🎧 Agent',
};

export function RoleSwitcher({ currentRole, onRoleChange }: RoleSwitcherProps) {
  return (
    <div className="cc-role-switcher">
      <select
        value={currentRole}
        onChange={(e) => onRoleChange(e.target.value as UserRole)}
        className="cc-role-select"
      >
        {(Object.keys(ALL_MOCK_SESSIONS) as UserRole[]).map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]} — {ALL_MOCK_SESSIONS[role].displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
