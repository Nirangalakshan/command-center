import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  ArrowLeft,
  Building2,
  Clock3,
  Loader2,
  MessageSquare,
  Send,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Permissions, UserSession } from '@/services/types';
import { useFirebaseAuth } from '@/integrations/firebase/useFirebaseAuth';
import {
  fetchConversations,
  fetchConversationMessages,
  postConversationMessage,
  postConversationRead,
  postConversationClaim,
  postConversationClose,
  fetchWorkshopName,
  fetchWorkshopNames,
  type Conversation,
  type ChatMessage,
} from '@/services/chatApi';
import {
  isChatSoundMuted,
  playNewChatChime,
  playNewMessageChime,
  setChatSoundMuted,
} from '@/lib/chatNotificationSounds';
import {
  logSystemActivity,
  AUDIT_ACTION_CHAT_VIEWED,
  AUDIT_ACTION_CHAT_REPLY,
  AUDIT_RESOURCE_BMS_CHAT,
} from '@/services/auditLogApi';

interface ChatTabProps {
  session: UserSession;
  permissions: Permissions;
  listTenantId?: string | null;
  workshopOwnerUid?: string | null;
  onInboxStatsChange?: (stats: { unreadCount: number }) => void;
}

function formatDateTime(iso: string): string {
  if (!iso) return 'N/A';
  const parsed = parseBackendDateTime(iso);
  if (!parsed) return 'N/A';
  return parsed.toLocaleString();
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const parsed = parseBackendDateTime(iso);
  if (!parsed) return '';
  return parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseBackendDateTime(value: string): Date | null {
  const msParsed = Date.parse(value);
  if (!Number.isNaN(msParsed)) {
    const d = new Date(msParsed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    const adjusted = value.length <= 10 ? n * 1000 : n;
    const d = new Date(adjusted);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function isLastMessageFromCustomer(
  conv: Conversation,
  sessionUserId: string,
  firebaseUid: string | null | undefined,
): boolean {
  const ls = conv.lastSender?.trim().toLowerCase();
  if (ls === 'customer') return true;
  if (ls === 'agent') return false;
  const aid = conv.agentId?.trim();
  if (aid && conv.lastMessage && sessionUserId.trim() !== aid && firebaseUid?.trim() !== aid) {
    return true;
  }
  return true;
}

export function ChatTab({
  session,
  permissions,
  listTenantId = null,
  workshopOwnerUid = null,
  onInboxStatsChange,
}: ChatTabProps) {
  const { firebaseUser } = useFirebaseAuth();

  const [queue, setQueue] = useState<Conversation[]>([]);
  const [mine, setMine] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [workshopName, setWorkshopName] = useState<string | null>(null);
  const [workshopNameMap, setWorkshopNameMap] = useState<Record<string, string>>({});

  const threadScrollRef = useRef<HTMLDivElement>(null);
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const lastChatViewAuditRef = useRef<{ chatId: string; at: number } | null>(null);
  const allRef = useRef<Conversation[]>([]);

  const [soundsMuted, setSoundsMuted] = useState(() => isChatSoundMuted());
  const skipInboxChimesRef = useRef(true);
  const prevInboxSnapshotRef = useRef<Map<string, string>>(new Map());
  const threadMessageSigRef = useRef<string>('');
  const skipThreadChimeRef = useRef(true);

  const chatListScope = useMemo(
    () => ({
      tenantId: listTenantId?.trim() || null,
      ownerUid: workshopOwnerUid?.trim() || null,
    }),
    [listTenantId, workshopOwnerUid],
  );

  const allConversations = useMemo(() => [...mine, ...queue], [mine, queue]);
  allRef.current = allConversations;

  const selectedConversation = useMemo(
    () => allConversations.find((c) => c.conversationId === selectedId) ?? null,
    [allConversations, selectedId],
  );

  const isMine = useMemo(
    () => mine.some((c) => c.conversationId === selectedId),
    [mine, selectedId],
  );

  const totalUnread = useMemo(
    () => allConversations.reduce((sum, c) => sum + c.unreadForAgent, 0),
    [allConversations],
  );

  useEffect(() => {
    onInboxStatsChange?.({ unreadCount: totalUnread });
  }, [totalUnread, onInboxStatsChange]);

  useEffect(() => {
    skipInboxChimesRef.current = true;
    prevInboxSnapshotRef.current = new Map();
  }, [chatListScope.tenantId, chatListScope.ownerUid]);

  const loadConversations = useCallback(async () => {
    const data = await fetchConversations({
      tenantId: chatListScope.tenantId,
      ownerUid: chatListScope.ownerUid,
    });
    setQueue(data.queue);
    setMine(data.mine);
    const ownerUids = [...data.queue, ...data.mine]
      .map((c) => c.ownerUid)
      .filter((uid): uid is string => !!uid);
    void fetchWorkshopNames(ownerUids).then(setWorkshopNameMap);
  }, [chatListScope]);

  const refreshThreadMessages = useCallback(async (conversationId: string) => {
    try {
      const rows = await fetchConversationMessages(conversationId);
      setMessages(rows);
    } catch {
      /* keep existing */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setError(null);
        await loadConversations();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load conversations.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const interval = setInterval(() => {
      void run();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (loading) return;

    const nextMap = new Map<string, string>();
    for (const c of allConversations) {
      nextMap.set(c.conversationId, c.lastMessageAt);
    }

    if (skipInboxChimesRef.current) {
      prevInboxSnapshotRef.current = nextMap;
      skipInboxChimesRef.current = false;
      return;
    }

    const prev = prevInboxSnapshotRef.current;
    let played = false;

    for (const c of allConversations) {
      if (played) break;
      const oldLast = prev.get(c.conversationId);
      if (oldLast === undefined) {
        void playNewChatChime();
        played = true;
        break;
      }
      if (oldLast !== c.lastMessageAt) {
        if (isLastMessageFromCustomer(c, session.userId, firebaseUser?.uid)) {
          void playNewMessageChime();
          played = true;
        }
      }
    }

    prevInboxSnapshotRef.current = nextMap;
  }, [allConversations, loading, session.userId, firebaseUser?.uid]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setThreadError(null);
      return;
    }

    let cancelled = false;

    const loadThread = async () => {
      setThreadLoading(true);
      setThreadError(null);
      try {
        const rows = await fetchConversationMessages(selectedId);
        if (cancelled) return;
        setMessages(rows);

        let readReceiptPosted = false;
        try {
          await postConversationRead(selectedId);
          readReceiptPosted = true;
        } catch {
          /* best-effort */
        }

        if (cancelled) return;

        const now = Date.now();
        const prevAudit = lastChatViewAuditRef.current;
        const skipDuplicate =
          prevAudit && prevAudit.chatId === selectedId && now - prevAudit.at < 2500;
        if (!skipDuplicate) {
          lastChatViewAuditRef.current = { chatId: selectedId, at: now };
          const meta = allRef.current.find((c) => c.conversationId === selectedId);
          void logSystemActivity(
            session,
            AUDIT_ACTION_CHAT_VIEWED,
            AUDIT_RESOURCE_BMS_CHAT,
            selectedId,
            {
              tenantName: meta?.userName ?? null,
              workshopDisplayName: null,
              readReceiptPosted,
            },
          ).catch(() => {});
        }

        if (!cancelled) void loadConversations();
      } catch (e) {
        if (!cancelled) {
          setThreadError(e instanceof Error ? e.message : 'Failed to load messages.');
          setMessages([]);
        }
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    };

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadConversations, session]);

  useEffect(() => {
    if (!selectedId) {
      setWorkshopName(null);
      return;
    }
    const conv = allConversations.find((c) => c.conversationId === selectedId);
    void fetchWorkshopName(conv?.ownerUid ?? null).then(setWorkshopName);
  }, [selectedId, allConversations]);

  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    const interval = setInterval(() => {
      void refreshThreadMessages(id);
    }, 30_000);
    return () => clearInterval(interval);
  }, [selectedId, refreshThreadMessages]);

  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshThreadMessages(id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [selectedId, refreshThreadMessages]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const ta = parseBackendDateTime(a.createdAt)?.getTime() ?? 0;
        const tb = parseBackendDateTime(b.createdAt)?.getTime() ?? 0;
        return ta !== tb ? ta - tb : (a.messageId || '').localeCompare(b.messageId || '');
      }),
    [messages],
  );

  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages, selectedId, threadLoading]);

  const isAgentMessage = useCallback(
    (m: ChatMessage) => {
      const uid = firebaseUser?.uid?.trim() ?? '';
      if (m.senderId === session.userId || (!!uid && m.senderId === uid)) return true;
      const aid = selectedConversation?.agentId?.trim();
      return !!aid && m.senderId === aid;
    },
    [session.userId, firebaseUser?.uid, selectedConversation?.agentId],
  );

  useEffect(() => {
    skipThreadChimeRef.current = true;
    threadMessageSigRef.current = '';
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || threadLoading) return;

    const last = sortedMessages[sortedMessages.length - 1];
    const lastKey = last
      ? `${last.messageId?.trim() || ''}|${last.createdAt}|${last.text.slice(0, 32)}`
      : '';

    if (skipThreadChimeRef.current) {
      threadMessageSigRef.current = lastKey;
      skipThreadChimeRef.current = false;
      return;
    }

    if (!lastKey || lastKey === threadMessageSigRef.current) return;

    if (last && !isAgentMessage(last) && !soundsMuted) {
      void playNewMessageChime();
    }
    threadMessageSigRef.current = lastKey;
  }, [sortedMessages, selectedId, threadLoading, isAgentMessage, soundsMuted]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setSelectedId(conversationId);
      const isInQueue = queue.some((c) => c.conversationId === conversationId);
      if (isInQueue) {
        setClaiming(true);
        try {
          await postConversationClaim(conversationId);
          await loadConversations();
        } catch {
          // console.warn('[ChatTab] claim failed', e);
        } finally {
          setClaiming(false);
        }
      }
    },
    [queue, loadConversations],
  );

  const handleClose = async () => {
    if (!selectedId || closing) return;
    setClosing(true);
    try {
      await postConversationClose(selectedId);
      setSelectedId(null);
      await loadConversations();
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Failed to close conversation.');
    } finally {
      setClosing(false);
    }
  };

  const handleSend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId || sending) return;

    setSending(true);
    setThreadError(null);
    try {
      const created = await postConversationMessage(selectedId, text);
      setDraft('');

      if (created) {
        const uid = firebaseUser?.uid?.trim() ?? '';
        const msg = !created.senderId?.trim()
          ? { ...created, senderId: uid || session.userId }
          : created;

        setMessages((prev) => {
          const id = msg.messageId?.trim();
          if (id && prev.some((p) => p.messageId === id)) return prev;
          return [...prev, msg];
        });
      } else {
        const rows = await fetchConversationMessages(selectedId);
        setMessages(rows);
      }

      void loadConversations();
      void refreshThreadMessages(selectedId);

      const replyId = created?.messageId?.trim() || null;
      void logSystemActivity(session, AUDIT_ACTION_CHAT_REPLY, AUDIT_RESOURCE_BMS_CHAT, selectedId, {
        messageId: replyId,
        textPreview: text.slice(0, 400),
        tenantName: selectedConversation?.userName ?? null,
      }).catch(() => {});
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!permissions.canViewChatTab && session.role !== 'super-admin') {
    return (
      <Card className="border-border/80 bg-white shadow-sm">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You do not have permission to view chats.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-stretch">
        <Card
          className={cn(
            'flex min-h-0 flex-col overflow-hidden border-border/80 bg-white shadow-sm',
            selectedId && 'max-lg:hidden',
          )}
        >
          <CardHeader className="shrink-0 pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-sky-600" />
                Chat Inbox
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-slate-900"
                  aria-label={soundsMuted ? 'Unmute new message sounds' : 'Mute new message sounds'}
                  title={soundsMuted ? 'Sounds off' : 'Sounds on'}
                  onClick={() => {
                    const next = !soundsMuted;
                    setChatSoundMuted(next);
                    setSoundsMuted(next);
                  }}
                >
                  {soundsMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Badge
                  variant="outline"
                  className={cn(
                    'tabular-nums',
                    totalUnread > 0
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-sky-200 bg-sky-50 text-sky-700',
                  )}
                >
                  {totalUnread} unread
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading conversations…
              </div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : allConversations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No conversations found.
              </div>
            ) : (
              <>
                {mine.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Mine
                    </p>
                    {mine.map((c) => (
                      <ConversationRow
                        key={c.conversationId}
                        conversation={c}
                        workshopName={c.ownerUid ? (workshopNameMap[c.ownerUid] ?? null) : null}
                        selected={selectedId === c.conversationId}
                        onSelect={() => void handleSelectConversation(c.conversationId)}
                      />
                    ))}
                  </div>
                )}
                {queue.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Queue
                    </p>
                    {queue.map((c) => (
                      <ConversationRow
                        key={c.conversationId}
                        conversation={c}
                        workshopName={c.ownerUid ? (workshopNameMap[c.ownerUid] ?? null) : null}
                        selected={selectedId === c.conversationId}
                        onSelect={() => void handleSelectConversation(c.conversationId)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden border-border/80 bg-white shadow-sm',
            !selectedId && 'max-lg:hidden',
          )}
        >
          {!selectedId ? (
            <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
              <MessageSquare className="mb-2 h-10 w-10 text-slate-300" />
              Select a conversation to view messages and reply.
            </CardContent>
          ) : (
            <>
              <CardHeader className="shrink-0 space-y-0 border-b border-slate-100 pb-3">
                <div className="flex items-start gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 shrink-0 lg:hidden"
                    onClick={() => setSelectedId(null)}
                    aria-label="Back to inbox"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">
                      {selectedConversation?.userName || 'Chat'}
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {selectedConversation?.userName || '—'}
                      </span>
                      {workshopName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {workshopName}
                        </span>
                      )}

                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          selectedConversation?.status === 'waiting'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                        )}
                      >
                        {selectedConversation?.status ?? '—'}
                      </Badge>
                      {!isMine && (
                        <Badge variant="outline" className="border-slate-200 text-[10px] text-slate-500">
                          Queue
                        </Badge>
                      )}
                      {claiming && (
                        <Badge className="flex items-center gap-1 border-sky-200 bg-sky-100 text-[10px] text-sky-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Claiming conversation…
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-0 px-4 pb-4 pt-3">
                {threadError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {threadError}
                  </div>
                )}

                <div
                  ref={threadScrollRef}
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                >
                  {threadLoading ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading messages…
                    </div>
                  ) : sortedMessages.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                      No messages yet. Send the first reply below.
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {sortedMessages.map((m, idx) => {
                        const mineMsg = isAgentMessage(m);
                        return (
                          <li
                            key={m.messageId?.trim() || `msg-${idx}-${m.createdAt}`}
                            className={cn('flex', mineMsg ? 'justify-end' : 'justify-start')}
                          >
                            <div
                              className={cn(
                                'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                                mineMsg
                                  ? 'rounded-br-md bg-sky-600 text-white'
                                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                              <div
                                className={cn(
                                  'mt-1 flex items-center gap-1 text-[10px]',
                                  mineMsg ? 'text-sky-100' : 'text-slate-400',
                                )}
                              >
                                <Clock3 className="h-3 w-3" />
                                {formatTime(m.createdAt) || 'Just now'}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div ref={messagesBottomRef} />
                </div>

                <form
                  onSubmit={(e) => void handleSend(e)}
                  className="flex shrink-0 gap-2 border-t border-slate-100 pt-2"
                >
                  <Input
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    placeholder="Type a message…"
                    disabled={sending || threadLoading || claiming}
                    className="flex-1"
                    autoComplete="off"
                  />
                  <Button
                    type="submit"
                    disabled={sending || threadLoading || claiming || !draft.trim()}
                    className="shrink-0 gap-1.5 bg-sky-600 hover:bg-sky-700"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                  <Button
                    type="button"
                    disabled={closing || sending || claiming}
                    onClick={() => void handleClose()}
                    className="shrink-0 gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
                  >
                    {closing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Close</span>
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

interface ConversationRowProps {
  conversation: Conversation;
  workshopName: string | null;
  selected: boolean;
  onSelect: () => void;
}

function ConversationRow({ conversation: c, workshopName, selected, onSelect }: ConversationRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3 text-left shadow-sm transition-colors',
        selected
          ? 'border-sky-400 bg-sky-50/80 ring-1 ring-sky-200/60'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80',
        c.unreadForAgent > 0 && !selected && 'border-l-4 border-l-emerald-500 pl-2.5',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {c.unreadForAgent > 0 && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.85)]"
              aria-hidden
            />
          )}
          <span className="truncate text-sm font-semibold text-slate-900">
            {c.userName || c.userEmail || 'Unknown user'}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {c.role && (
            <Badge variant="outline" className="border-slate-200 text-[10px] text-slate-500">
              {c.role}
            </Badge>
          )}
          {c.claimedAt && c.status !== 'closed' && (
            <Badge className="border border-sky-200 bg-sky-100 text-[10px] text-sky-700">
              Claimed
            </Badge>
          )}
          {(c.status === 'closed' || c.closedAt) && (
            <Badge className="bg-rose-600 text-[10px] text-white">Closed</Badge>
          )}
          {c.unreadForAgent > 0 && (
            <Badge className="bg-amber-500 text-white">{c.unreadForAgent}</Badge>
          )}
        </div>
      </div>
      {workshopName && (
        <p className="mb-0.5 flex items-center gap-1 text-[11px] text-slate-500">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{workshopName}</span>
        </p>
      )}
      <p className="line-clamp-2 text-xs text-slate-600">{c.lastMessage || 'No messages yet.'}</p>
      <span className="mt-1 block text-[10px] text-slate-400">{formatDateTime(c.lastMessageAt)}</span>
    </button>
  );
}
