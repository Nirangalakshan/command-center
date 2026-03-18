import { useState, useCallback } from 'react';
import type { AgentOnboarding, AgentStatus, Tenant, Queue, AgentGroup, Permissions } from '@/services/types';
import { AgentOnboardingStageBadge } from '@/components/dashboard/AgentOnboardingStageBadge';
import { AgentTrainingChecklist } from '@/components/dashboard/AgentTrainingChecklist';
import { CreateAgentModal, type CreateAgentData } from '@/components/dashboard/CreateAgentModal';
import { createAgentViaEdge, advanceAgentStage, updateTrainingChecklist } from '@/services/agentOnboardingApi';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { StatusBadge } from '@/components/dashboard/StatusBadge';

interface Props {
  agentOnboarding: AgentOnboarding[];
  tenants: Tenant[];
  queues: Queue[];
  agentGroups: AgentGroup[];
  permissions: Permissions;
  onRefresh: () => void;
}

export function AgentOnboardingTab({ agentOnboarding, tenants, queues, agentGroups, permissions, onRefresh }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState('all');

  const stages = ['invited', 'account-created', 'training', 'shadowing', 'live'] as const;

  const filtered = filterStage === 'all'
    ? agentOnboarding
    : agentOnboarding.filter((a) => a.stage === filterStage);

  const handleCreate = useCallback(async (data: CreateAgentData) => {
    await createAgentViaEdge(data);
    onRefresh();
  }, [onRefresh]);

  const handleAdvance = useCallback(async (id: string, stage: AgentOnboarding['stage']) => {
    await advanceAgentStage(id, stage);
    onRefresh();
  }, [onRefresh]);

  const handleChecklistChange = useCallback(async (id: string, checklist: AgentOnboarding['trainingChecklist']) => {
    await updateTrainingChecklist(id, checklist);
    onRefresh();
  }, [onRefresh]);

  const canManage = permissions.canOnboardAgents;

  return (
    <div className="cc-fade-in">
      <div className="cc-section-header">
        <h2 className="cc-section-title">AGENT ONBOARDING</h2>
        {canManage && (
          <button className="cc-btn cc-btn-primary" onClick={() => setModalOpen(true)}>
            + Add Agent
          </button>
        )}
      </div>

      {/* Stage filters */}
      <div className="cc-filters">
        <button className={`cc-chip ${filterStage === 'all' ? 'cc-chip-active' : ''}`} onClick={() => setFilterStage('all')}>
          All ({agentOnboarding.length})
        </button>
        {stages.map((s) => {
          const count = agentOnboarding.filter((a) => a.stage === s).length;
          return (
            <button key={s} className={`cc-chip ${filterStage === s ? 'cc-chip-active' : ''}`} onClick={() => setFilterStage(s)}>
              {s.replace('-', ' ')} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No agents in onboarding pipeline" />
      ) : (
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Tenant</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Email</th>
                <th>Invited</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ao) => (
                <>
                  <tr key={ao.id} onClick={() => setExpandedId(expandedId === ao.id ? null : ao.id)}>
                    <td>
                      <div className="cc-agent-name">{ao.agentName}</div>
                      <div className="cc-table-muted" style={{ fontSize: 11 }}>Ext {ao.agentExtension}</div>
                    </td>
                    <td>{ao.tenantName}</td>
                    <td><AgentOnboardingStageBadge stage={ao.stage} /></td>
                    <td><StatusBadge status={ao.agentStatus} /></td>
                    <td className="cc-table-mono">{ao.personalEmail}</td>
                    <td className="cc-table-mono">{new Date(ao.invitedAt).toLocaleDateString()}</td>
                    {canManage && (
                      <td>
                        {ao.stage !== 'live' && (
                          <button
                            className="cc-btn cc-btn-sm cc-btn-ghost"
                            onClick={(e) => { e.stopPropagation(); handleAdvance(ao.id, ao.stage); }}
                          >
                            Advance →
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {expandedId === ao.id && (
                    <tr key={`${ao.id}-detail`}>
                      <td colSpan={canManage ? 7 : 6} style={{ padding: '16px 20px', background: 'var(--cc-bg-elevated)' }}>
                        <div className="cc-onboarding-detail">
                          <AgentTrainingChecklist
                            checklist={ao.trainingChecklist}
                            onChange={(c) => handleChecklistChange(ao.id, c)}
                            readOnly={!canManage}
                          />
                          {ao.notes && (
                            <div className="cc-detail-notes">
                              <span className="cc-form-label">Notes</span>
                              <p>{ao.notes}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        tenants={tenants}
        queues={queues}
        agentGroups={agentGroups}
      />
    </div>
  );
}
