import { useMemo, useState, useEffect } from 'react';
import type { Agent, Call, Queue, Tenant } from '@/services/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatDuration } from '@/utils/formatters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart, Clock, Phone, TrendingUp, Users, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { 
  fetchSalesSuburbWorkshopAgentContactTenant, 
  type SalesSuburbWorkshopContactRow 
} from '@/services/salesWorkspaceApi';

interface AgentPerformanceTabProps {
  agents: Agent[];
  calls: Call[];
  queues: Queue[];
  tenants: Tenant[];
  tenantId?: string | null;
}

export function AgentPerformanceTab({ agents, calls, tenantId }: AgentPerformanceTabProps) {
  const [workshopContacts, setWorkshopContacts] = useState<SalesSuburbWorkshopContactRow[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    fetchSalesSuburbWorkshopAgentContactTenant(tenantId)
      .then(setWorkshopContacts)
      .catch(() => {});
  }, [tenantId]);

  const performanceData = useMemo(() => {
    // Only include Command Center agents (no BMS link)
    const ccAgents = agents.filter(a => !String(a.bmsOwnerUid ?? '').trim());

    return ccAgents.map((agent) => {
      const agentCalls = calls.filter((c) => c.agentId === agent.id);
      const answeredCalls = agentCalls.filter((c) => c.result === 'answered');
      
      const totalDuration = answeredCalls.reduce((acc, call) => acc + (call.durationSeconds || 0), 0);
      const avgDuration = answeredCalls.length > 0 ? Math.round(totalDuration / answeredCalls.length) : 0;
      
      // Calculate answer rate
      const answerRate = agentCalls.length > 0 
        ? Math.round((answeredCalls.length / agentCalls.length) * 100) 
        : 0;

      // Call List (Workshops) Performance
      const agentWorkshopContacts = workshopContacts.filter(c => c.agent_id === agent.id);
      const listAttempted = agentWorkshopContacts.length;
      const listConfirmed = agentWorkshopContacts.filter(c => c.call_status === 'confirmed').length;
      const listRejected = agentWorkshopContacts.filter(c => c.call_status === 'rejected').length;

      return {
        ...agent,
        totalCalls: agentCalls.length,
        answeredCalls: answeredCalls.length,
        totalDuration,
        avgDuration,
        answerRate,
        listAttempted,
        listConfirmed,
        listRejected,
      };
    }).sort((a, b) => {
      if (b.answeredCalls !== a.answeredCalls) return b.answeredCalls - a.answeredCalls;
      return b.listAttempted - a.listAttempted;
    });
  }, [agents, calls, workshopContacts]);

  // Aggregate stats
  const totalAgents = performanceData.length;
  const totalAnswered = performanceData.reduce((acc, a) => acc + a.answeredCalls, 0);
  const avgTeamHandleTime = totalAnswered > 0 
    ? Math.round(performanceData.reduce((acc, a) => acc + a.totalDuration, 0) / totalAnswered)
    : 0;

  return (
    <div className="cc-fade-in space-y-6">
      {/* Top Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/80 bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Agents</p>
              <p className="text-2xl font-bold text-slate-900">{totalAgents}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/80 bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Answered Calls</p>
              <p className="text-2xl font-bold text-slate-900">{totalAnswered}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Avg Handle Time</p>
              <p className="text-2xl font-bold text-slate-900">{formatDuration(avgTeamHandleTime * 1000)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-white shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Top Performer</p>
              <p className="text-lg font-bold text-slate-900 truncate">
                {performanceData.length > 0 ? performanceData[0].name : '-'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <BarChart className="h-5 w-5 text-indigo-500" />
            Command Center Agent Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {performanceData.length === 0 ? (
             <div className="p-8">
               <EmptyState message="No command center agents found for performance analysis" />
             </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="w-[200px]" rowSpan={2}>Agent</TableHead>
                    <TableHead rowSpan={2}>Current Status</TableHead>
                    <TableHead className="text-center border-l border-slate-200" colSpan={5}>Call Handling</TableHead>
                    <TableHead className="text-center border-l border-slate-200" colSpan={3}>My Call List</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-right border-l border-slate-200 text-xs">Total</TableHead>
                    <TableHead className="text-right text-xs">Answered</TableHead>
                    <TableHead className="text-right text-xs">Rate</TableHead>
                    <TableHead className="text-right text-xs">Avg Handle</TableHead>
                    <TableHead className="text-right text-xs">Duration</TableHead>
                    <TableHead className="text-right border-l border-slate-200 text-xs">Attempted</TableHead>
                    <TableHead className="text-right text-xs">Confirmed</TableHead>
                    <TableHead className="text-right text-xs">Rejected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceData.map((agent) => (
                    <TableRow key={agent.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{agent.name}</span>
                          <span className="text-xs text-slate-500 font-mono">Ext {agent.extension}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={agent.status} />
                      </TableCell>
                      
                      {/* Call Handling */}
                      <TableCell className="text-right text-slate-600 border-l border-slate-100">{agent.totalCalls}</TableCell>
                      <TableCell className="text-right font-medium text-slate-900">{agent.answeredCalls}</TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          agent.answerRate >= 90 ? 'bg-emerald-100 text-emerald-700' :
                          agent.answerRate >= 70 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {agent.answerRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-600 font-mono text-xs">
                        {formatDuration(agent.avgDuration * 1000)}
                      </TableCell>
                      <TableCell className="text-right text-slate-600 font-mono text-xs">
                        {formatDuration(agent.totalDuration * 1000)}
                      </TableCell>

                      {/* My Call List */}
                      <TableCell className="text-right text-slate-600 border-l border-slate-100">
                        <div className="flex items-center justify-end gap-1">
                          <FileText className="h-3 w-3 text-slate-400" />
                          {agent.listAttempted}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">
                        <div className="flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {agent.listConfirmed}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-rose-600 font-medium">
                        <div className="flex items-center justify-end gap-1">
                          <XCircle className="h-3 w-3" />
                          {agent.listRejected}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
