import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/context/DashboardDataContext';
import { 
  fetchInternalConversations, 
  fetchInternalMessages, 
  sendInternalMessage, 
  getOrCreateInternalConversation,
  subscribeToInternalMessages,
  subscribeToAllInternalConversations,
  fetchAllInternalConversations,
  InternalChatConversation,
  InternalChatMessage
} from '@/services/chatApi';
import { UserSession, Agent, Permissions } from '@/services/types';
import { 
  MessageSquare, 
  Send, 
  User, 
  Plus,
  Search,
  Clock,
  Clock3,
  Check,
  CheckCheck,
  ArrowLeft,
  ShieldAlert,
  Loader2,
  ChevronRight,
  MoreVertical
} from 'lucide-react';
import { 
  playNewMessageChime, 
  isChatSoundMuted 
} from '@/lib/chatNotificationSounds';
import { formatDistanceToNow } from 'date-fns';

interface InternalChatTabProps {
  session: UserSession;
  permissions: Permissions;
}

export function InternalChatTab({ session, permissions }: InternalChatTabProps) {
  const { agents } = useDashboard();
  const [conversations, setConversations] = useState<InternalChatConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');

  const currentAgent = useMemo(() => 
    agents.find(a => a.userId === session.userId), 
    [agents, session.userId]
  );

  const isSuperAdmin = session.role === 'super-admin';

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!currentAgent && !isSuperAdmin) return;
    try {
      const data = isSuperAdmin 
        ? await fetchAllInternalConversations() 
        : await fetchInternalConversations(currentAgent!.id);
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations', error);
    } finally {
      setLoading(false);
    }
  }, [currentAgent, isSuperAdmin]);

  useEffect(() => {
    loadConversations();
    const unsub = subscribeToAllInternalConversations(() => {
      loadConversations();
    });
    return () => { unsub(); };
  }, [loadConversations]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const { markInternalMessagesAsRead } = await import('@/services/chatApi');
        const data = await fetchInternalMessages(selectedConvId);
        setMessages(data);
        
        // Mark as read
        if (currentAgent) {
          await markInternalMessagesAsRead(selectedConvId, currentAgent.id);
          // Dispatch event to refresh global unread count in DashboardPage
          window.dispatchEvent(new CustomEvent('internal-chat-read'));
        }
      } catch (error) {
        console.error('Failed to load messages', error);
      }
    };

    loadMessages();
    const unsub = subscribeToInternalMessages(selectedConvId, (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        
        // Play sound if not from self
        if (msg.sender_id !== currentAgent?.id && !isChatSoundMuted()) {
          void playNewMessageChime();
        }
        
        return [...prev, msg];
      });
      loadConversations(); // Refresh last message in list
    });

    return () => { unsub(); };
  }, [selectedConvId, loadConversations]);

  // Handle auto-starting a chat from the dashboard
  const { pendingInternalChatAgentId, setPendingInternalChatAgentId } = useDashboard();
  useEffect(() => {
    if (pendingInternalChatAgentId && currentAgent) {
      handleStartChat(pendingInternalChatAgentId);
      setPendingInternalChatAgentId(null);
    }
  }, [pendingInternalChatAgentId, currentAgent]);

  const selectedConv = useMemo(() => 
    conversations.find(c => c.id === selectedConvId), 
    [conversations, selectedConvId]
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selectedConvId || !currentAgent) return;

    const content = draft.trim();
    setDraft('');
    try {
      await sendInternalMessage(selectedConvId, currentAgent.id, content);
    } catch (error) {
      console.error('Failed to send message', error);
    }
  };

  const handleStartChat = async (targetAgentId: string) => {
    if (!currentAgent) return;
    try {
      const convId = await getOrCreateInternalConversation(currentAgent.id, targetAgentId);
      setSelectedConvId(convId);
      setShowNewChat(false);
      await loadConversations();
    } catch (error) {
      console.error('Failed to start chat', error);
    }
  };

  const filteredAgents = useMemo(() => {
    const search = agentSearch.toLowerCase();
    return agents.filter(a => 
      a.id !== currentAgent?.id && 
      (a.name.toLowerCase().includes(search) || a.extension.includes(search))
    );
  }, [agents, currentAgent, agentSearch]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <MessageSquare className="h-8 w-8 text-slate-300" />
          <span className="text-slate-400 text-sm">Loading chats...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-0 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col w-full border-r border-slate-100 bg-slate-50/50 md:w-80",
        selectedConvId && "hidden md:flex"
      )}>
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Messages</h2>
            {!isSuperAdmin && (
              <Button size="icon" variant="ghost" onClick={() => setShowNewChat(true)} className="rounded-full bg-white shadow-sm hover:bg-slate-50 border border-slate-100">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search chats..." 
              className="pl-10 bg-white border-slate-200 rounded-2xl h-10 text-sm focus:ring-emerald-500/20"
            />
          </div>

          {!isSuperAdmin && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Quick Message</label>
              <Select onValueChange={handleStartChat}>
                <SelectTrigger className="w-full bg-white border-slate-200 rounded-2xl h-10 text-sm shadow-sm">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                  {agents
                    .filter(a => a.id !== currentAgent?.id && !String(a.bmsOwnerUid ?? '').trim())
                    .map(agent => (
                      <SelectItem key={agent.id} value={agent.id} className="rounded-xl focus:bg-emerald-50 focus:text-emerald-900 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            agent.status === 'available' ? "bg-emerald-500" : "bg-slate-300"
                          )} />
                          <span>{agent.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono ml-auto">ext {agent.extension}</span>
                        </div>
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <MessageSquare className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-900">No chats yet</p>
                <p className="text-xs text-slate-500 mt-1">Start a conversation with another agent.</p>
              </div>
            ) : (
              conversations.map(conv => {
                const other = isSuperAdmin 
                  ? { name: `${(conv as any).agentA?.name} & ${(conv as any).agentB?.name}`, status: 'available' }
                  : conv.otherParticipant;
                
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-2xl transition-all duration-200",
                      selectedConvId === conv.id 
                        ? "bg-white shadow-md shadow-emerald-100/50 ring-1 ring-emerald-100" 
                        : "hover:bg-white/80"
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                        <AvatarFallback className="bg-emerald-50 text-emerald-700 text-sm font-bold">
                          {other?.name?.substring(0, 2).toUpperCase() || '??'}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white",
                        other?.status === 'available' ? "bg-emerald-500" :
                        other?.status === 'on-call' ? "bg-rose-500" : "bg-slate-300"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="font-bold text-slate-900 truncate text-sm">
                          {other?.name}
                        </span>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-xs truncate",
                        conv.unreadCount ? "text-emerald-600 font-bold" : "text-slate-500"
                      )}>
                        {conv.last_message || "No messages yet"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className={cn(
        "flex flex-col flex-1 bg-white min-w-0",
        !selectedConvId && "hidden md:flex"
      )}>
        {selectedConvId ? (
          <>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-sm z-10 sticky top-0">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setSelectedConvId(null)}
                  className="md:hidden"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="relative">
                  <Avatar className="h-10 w-10 border border-slate-100">
                    <AvatarFallback className="bg-emerald-50 text-emerald-700 font-bold text-xs">
                      {isSuperAdmin 
                        ? 'AD'
                        : selectedConv?.otherParticipant?.name?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 leading-none mb-1">
                    {isSuperAdmin 
                      ? `${(selectedConv as any).agentA?.name} & ${(selectedConv as any).agentB?.name}`
                      : selectedConv?.otherParticipant?.name}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isSuperAdmin ? "bg-amber-500" :
                      selectedConv?.otherParticipant?.status === 'available' ? "bg-emerald-500" : "bg-slate-300"
                    )} />
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                      {isSuperAdmin ? 'SUPER ADMIN VIEWING' : selectedConv?.otherParticipant?.status || 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6 bg-slate-50/30">
              <div className="space-y-4">
                {messages.map((msg, idx) => {
                  const isMine = msg.sender_id === currentAgent?.id;
                  const showAvatar = idx === 0 || messages[idx-1].sender_id !== msg.sender_id;
                  const sender = agents.find(a => a.id === msg.sender_id);

                  return (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "flex flex-col",
                        isMine ? "items-end" : "items-start"
                      )}
                    >
                      {!isMine && showAvatar && (
                        <span className="text-[10px] font-bold text-slate-400 ml-10 mb-1">
                          {sender?.name}
                        </span>
                      )}
                      <div className={cn(
                        "flex gap-2 max-w-[80%]",
                        isMine ? "flex-row-reverse" : "flex-row"
                      )}>
                        {!isMine && (
                          <div className="w-8 shrink-0">
                            {showAvatar && (
                              <Avatar className="h-8 w-8 border border-white shadow-sm">
                                <AvatarFallback className="text-[10px] bg-white text-emerald-700">
                                  {sender?.name?.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        )}
                        <div className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                          isMine 
                            ? "bg-emerald-600 text-white rounded-tr-none" 
                            : "bg-white border border-slate-100 text-slate-700 rounded-tl-none"
                        )}>
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <div className={cn(
                            "flex items-center justify-end gap-1 mt-1 opacity-70 tabular-nums",
                            isMine ? "text-emerald-50" : "text-slate-400"
                          )}>
                            <span className="text-[9px]">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMine && (msg.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {(!isSuperAdmin || (isSuperAdmin && currentAgent)) && (
              <div className="p-4 bg-white border-t border-slate-100">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Input 
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      placeholder="Type your message..."
                      className="w-full bg-slate-50 border-transparent rounded-2xl py-6 pl-4 pr-12 focus:bg-white focus:ring-emerald-500/10 transition-all"
                    />
                    <Button 
                      type="submit" 
                      size="icon" 
                      disabled={!draft.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4 text-white" />
                    </Button>
                  </div>
                </form>
              </div>
            )}
            
            {isSuperAdmin && !currentAgent && (
              <div className="p-4 bg-amber-50 border-t border-amber-100 flex items-center justify-center gap-2 text-amber-700 text-xs font-medium">
                <ShieldAlert className="h-4 w-4" />
                Read-only View (Super Admin)
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/20">
            <div className="h-20 w-20 rounded-[2.5rem] bg-emerald-50 flex items-center justify-center mb-6 shadow-inner">
              <MessageSquare className="h-10 w-10 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Internal Agent Chat</h3>
            <p className="text-slate-500 max-w-xs mb-8">
              Select an agent from the sidebar or start a new conversation to begin chatting.
            </p>
            {!isSuperAdmin && (
              <Button onClick={() => setShowNewChat(true)} className="rounded-2xl px-6 h-12 bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-200 font-bold gap-2">
                <Plus className="h-5 w-5" />
                New Chat
              </Button>
            )}
          </div>
        )}
      </div>

      {/* New Chat Dialog/Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <Card className="w-full max-w-md rounded-[2rem] border-none shadow-2xl overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Start a new chat</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowNewChat(false)} className="text-white/80 hover:text-white hover:bg-white/10">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </div>
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-200" />
                <Input 
                  placeholder="Search agents by name or extension..." 
                  value={agentSearch}
                  onChange={e => setAgentSearch(e.target.value)}
                  className="bg-emerald-700/50 border-emerald-500/50 text-white placeholder:text-emerald-300 rounded-xl pl-10 focus:ring-white/20"
                />
              </div>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-80">
                <div className="space-y-1 p-2">
                  {filteredAgents.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                      No agents found matching "{agentSearch}"
                    </div>
                  ) : (
                    filteredAgents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => handleStartChat(agent.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <Avatar className="h-10 w-10 border border-slate-100">
                          <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-bold">
                            {agent.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900">{agent.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-mono">Ext: {agent.extension}</span>
                            <div className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              agent.status === 'available' ? "bg-emerald-500" : "bg-slate-300"
                            )} />
                            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{agent.status}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
