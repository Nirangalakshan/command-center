import { useState } from 'react';
import type { TenantOnboarding, Permissions, NewClientForm, OnboardingStage } from '@/services/types';
import { OnboardingStageBadge } from '@/components/dashboard/OnboardingStageBadge';
import { ClientSignupModal } from '@/components/dashboard/ClientSignupModal';

const STAGES: OnboardingStage[] = [
  'signup', 'tenant-created', 'phone-setup', 'business-config',
  'call-flow-design', 'agent-training', 'soft-launch', 'go-live', 'monitoring',
];

interface Props {
  clients: TenantOnboarding[];
  permissions: Permissions;
  onCreateClient: (data: NewClientForm) => void;
  onAdvanceStage: (clientId: string) => void;
}

export function ClientsTab({ clients, permissions, onCreateClient, onAdvanceStage }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const visibleClients = permissions.canViewAllTenants
    ? clients
    : clients.filter((c) => c.id === permissions.allowedTenantId);

  return (
    <div className="cc-fade-in">
      <div className="cc-section-header">
        <span className="cc-section-title">CLIENT ONBOARDING</span>
        {permissions.canSignUpClients && (
          <button className="cc-btn cc-btn-primary" onClick={() => setModalOpen(true)}>
            + New Client
          </button>
        )}
      </div>

      {visibleClients.length === 0 ? (
        <div className="cc-empty">
          <span className="cc-empty-icon">📋</span>
          <span className="cc-empty-text">No clients yet. Sign up your first client to get started.</span>
        </div>
      ) : (
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Industry</th>
                <th>Contact</th>
                <th>Stage</th>
                <th>Created</th>
                {permissions.canAdvanceOnboarding && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((c) => {
                const stageIdx = STAGES.indexOf(c.onboardingStage);
                const isLast = stageIdx >= STAGES.length - 1;
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          className="cc-client-dot"
                          style={{ background: c.brandColor }}
                        />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </div>
                    </td>
                    <td className="cc-table-mono">{c.industry}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{c.contactName || '—'}</div>
                      <div className="cc-table-mono cc-table-muted" style={{ fontSize: 11 }}>
                        {c.contactEmail || c.contactPhone || '—'}
                      </div>
                    </td>
                    <td><OnboardingStageBadge stage={c.onboardingStage} /></td>
                    <td className="cc-table-mono cc-table-muted">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    {permissions.canAdvanceOnboarding && (
                      <td>
                        {!isLast ? (
                          <button
                            className="cc-btn cc-btn-small cc-btn-ghost"
                            onClick={() => onAdvanceStage(c.id)}
                          >
                            Advance →
                          </button>
                        ) : (
                          <span className="cc-table-muted">✓ Live</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ClientSignupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={onCreateClient}
      />
    </div>
  );
}
