import type { Call, CallResult } from '@/services/types';

const STORAGE_KEY = 'cc_linkus_call_log_v1';
const MAX_ENTRIES = 80;

export const LINKUS_CALL_LOG_EVENT = 'cc:linkus-call-log-updated';

export type LinkusSessionEndPayload = {
  callId: string;
  direction: 'inbound' | 'outbound';
  number: string;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  lastCallStatus: 'ringing' | 'calling' | 'talking' | 'connecting';
};

export type SoftphoneCallLogContext = {
  tenantId: string;
  tenantName: string;
  agentId: string | null;
  agentName: string;
  queueId: string;
  queueName: string;
};

function endResult(last: LinkusSessionEndPayload['lastCallStatus']): CallResult {
  if (last === 'talking') return 'answered';
  return 'missed';
}

export function buildCallFromLinkusSessionEnd(
  ctx: SoftphoneCallLogContext,
  p: LinkusSessionEndPayload,
): Call {
  const answered = p.lastCallStatus === 'talking';
  const durationSeconds = Math.max(
    0,
    Math.round((p.endTimeMs - p.startTimeMs) / 1000),
  );
  const digits = p.number.replace(/\D/g, '');
  const callerNumber = digits || p.number.trim();

  return {
    id: `linkus-${p.callId}-${p.endTimeMs}`,
    tenantId: ctx.tenantId,
    queueId: ctx.queueId,
    agentId: ctx.agentId,
    direction: p.direction,
    callerNumber,
    callerName: p.name?.trim() ? p.name : null,
    dialedNumber: null,
    startTime: new Date(p.startTimeMs).toISOString(),
    answerTime: answered ? new Date(p.startTimeMs).toISOString() : null,
    endTime: new Date(p.endTimeMs).toISOString(),
    durationSeconds,
    result: endResult(p.lastCallStatus),
    recordingUrl: null,
    transcriptStatus: 'none',
    summaryStatus: 'none',
    agentName: ctx.agentName,
    queueName: ctx.queueName,
    tenantName: ctx.tenantName,
  };
}

export function readLinkusCallLog(): Call[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Call[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendLinkusCallLog(entry: Call): void {
  try {
    const prev = readLinkusCallLog();
    const next = [entry, ...prev].slice(0, MAX_ENTRIES);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(LINKUS_CALL_LOG_EVENT));
  } catch {
    /* quota / private mode */
  }
}

/** Merge PBX `calls` rows with browser-logged Linkus sessions; drop local rows duplicated by recent server CDR. */
export function mergeCallsWithLinkusLog(server: Call[], local: Call[]): Call[] {
  const out: Call[] = [...server];
  const windowMs = 3 * 60_000;

  for (const l of local) {
    if (!l.id.startsWith('linkus-')) continue;

    const dup = server.some((s) => {
      if (s.direction !== l.direction || l.direction !== 'outbound') return false;
      if (s.callerNumber !== l.callerNumber) return false;
      const a = new Date(s.startTime).getTime();
      const b = new Date(l.startTime).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return Math.abs(a - b) < windowMs;
    });

    if (!dup) out.push(l);
  }

  return out.sort(
    (a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
}
