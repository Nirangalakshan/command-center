import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Agent, Permissions, Queue, Tenant } from '@/services/types';
import { formatTime } from '@/utils/formatters';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface ChatTabProps {
  agents: Agent[];
  queues: Queue[];
  tenants: Tenant[];
  permissions: Permissions;
}

type ChatRole = 'operator' | 'agent' | 'system';

interface ChatMessage {
  id: string;
  role: ChatRole;
  body: string;
  at: string;
}

function initialThread(agent: Agent): ChatMessage[] {
  const at = new Date().toISOString();
  return [
    {
      id: `${agent.id}-sys`,
      role: 'system',
      body: 'Placeholder thread — connect your workshop messaging API to load real history.',
      at,
    },
    {
      id: `${agent.id}-a1`,
      role: 'agent',
      body: `Hi, this is ${agent.name}. Workshop messages will appear here.`,
      at,
    },
  ];
}

export function ChatTab({ agents, queues, tenants, permissions }: ChatTabProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [draft, setDraft] = useState('');
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const visibleAgents = useMemo(() => {
    if (permissions.allowedQueueIds.length > 0) {
      return agents.filter((a) =>
        a.queueIds.some((qid) => permissions.allowedQueueIds.includes(qid)),
      );
    }
    return agents;
  }, [agents, permissions.allowedQueueIds]);

  /** Chats are keyed by workshop-linked agents (same notion as the Agents tab “Workshop” group). */
  const chatAgents = useMemo(
    () => visibleAgents.filter((a) => Boolean(String(a.bmsOwnerUid ?? '').trim())),
    [visibleAgents],
  );

  useEffect(() => {
    if (chatAgents.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && chatAgents.some((a) => a.id === prev) ? prev : chatAgents[0].id,
    );
  }, [chatAgents]);

  const selectedAgent = useMemo(
    () => chatAgents.find((a) => a.id === selectedId) ?? null,
    [chatAgents, selectedId],
  );

  useEffect(() => {
    if (!selectedAgent) return;
    setThreads((prev) => {
      if (prev[selectedAgent.id]) return prev;
      return { ...prev, [selectedAgent.id]: initialThread(selectedAgent) };
    });
  }, [selectedAgent]);

  const messages = selectedAgent ? threads[selectedAgent.id] ?? [] : [];

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chatAgents;
    return chatAgents.filter((a) => {
      const tenant = tenants.find((t) => t.id === a.tenantId);
      const queueNames = a.queueIds
        .map((id) => queues.find((x) => x.id === id)?.name)
        .filter(Boolean)
        .join(' ');
      const hay = `${a.name} ${a.extension} ${a.email ?? ''} ${tenant?.name ?? ''} ${queueNames}`.toLowerCase();
      return hay.includes(q);
    });
  }, [chatAgents, search, tenants, queues]);

  const scrollToBottom = useCallback(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [selectedId, messages.length, scrollToBottom]);

  const sendDraft = useCallback(() => {
    const text = draft.trim();
    if (!text || !selectedAgent) return;
    const msg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'operator',
      body: text,
      at: new Date().toISOString(),
    };
    setThreads((prev) => ({
      ...prev,
      [selectedAgent.id]: [...(prev[selectedAgent.id] ?? initialThread(selectedAgent)), msg],
    }));
    setDraft('');
  }, [draft, selectedAgent]);

  return (
    <div className="cc-fade-in space-y-4">
      <Card className="border-border/80 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agent chat</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a workshop agent on the left. Message history is local placeholder until your backend is wired.
          </p>
        </CardHeader>
      </Card>

      <Card className="flex min-h-[min(calc(100vh-14rem),720px)] flex-col overflow-hidden border-border/80 bg-white shadow-sm">
        <CardContent className="flex flex-1 flex-col gap-0 p-0 sm:flex-row">
          {/* Left: conversation list */}
          <aside className="flex w-full flex-col border-b border-border/60 sm:w-[320px] sm:shrink-0 sm:border-b-0 sm:border-r">
            <div className="border-b border-border/60 p-3">
              <Input
                className="bg-white"
                placeholder="Search agents…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto">
              {filteredList.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    message={
                      chatAgents.length === 0
                        ? 'No workshop agents yet. Onboard agents with a workshop link to start chats.'
                        : 'No agents match your search.'
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredList.map((a) => {
                    const active = a.id === selectedId;
                    const tenant = tenants.find((t) => t.id === a.tenantId);
                    const thread = threads[a.id];
                    const last =
                      thread && thread.length > 0 ? thread[thread.length - 1] : undefined;
                    const preview = last?.body ?? 'No messages yet';
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className={`flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                            active ? 'bg-slate-100' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-foreground">{a.name}</span>
                            <StatusBadge status={a.status} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="font-mono tabular-nums">Ext {a.extension}</span>
                            {permissions.canViewTenantNames && tenant && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="truncate">{tenant.name}</span>
                              </>
                            )}
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{preview}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Right: active thread */}
          <section className="flex min-h-[320px] min-w-0 flex-1 flex-col">
            {!selectedAgent ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <EmptyState message="Select a chat from the list" />
              </div>
            ) : (
              <>
                <header className="border-b border-border/60 px-4 py-3">
                  <h2 className="text-base font-semibold text-foreground">{selectedAgent.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">Ext {selectedAgent.extension}</span>
                    {selectedAgent.email && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span>{selectedAgent.email}</span>
                      </>
                    )}
                  </p>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === 'operator' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[min(100%,520px)] rounded-2xl px-3.5 py-2.5 text-sm ${
                          m.role === 'system'
                            ? 'border border-dashed border-slate-200 bg-slate-50 text-center text-muted-foreground'
                            : m.role === 'operator'
                              ? 'bg-slate-900 text-white'
                              : 'border border-border/80 bg-slate-50 text-foreground'
                        }`}
                      >
                        {m.role !== 'system' && (
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                            {m.role === 'agent' ? 'Agent' : 'You'}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div className="mt-1.5 text-[10px] opacity-70">{formatTime(m.at)}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={listEndRef} />
                </div>

                <footer className="border-t border-border/60 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Textarea
                      className="min-h-[80px] flex-1 resize-none bg-white"
                      placeholder="Type a message (saved locally until API is connected)…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendDraft();
                        }
                      }}
                    />
                    <Button type="button" className="shrink-0 sm:mb-0.5" onClick={sendDraft}>
                      Send
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">Enter to send · Shift+Enter for newline</p>
                </footer>
              </>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
