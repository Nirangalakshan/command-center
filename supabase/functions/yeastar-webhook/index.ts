import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ═══════════════════════════════════════════════════════════
// Yeastar PBX Webhook — Supabase Edge Function
// Receives real-time events from Yeastar P-Series / S-Series
// and syncs them into the Command Centre database.
// ═══════════════════════════════════════════════════════════

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const RECORDING_BASE_URL = Deno.env.get('YEASTAR_RECORDING_BASE_URL') ?? '';

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const normalized = normalizeYeastarPayload(body);
  const { action, payload } = normalized;
  console.log(
    `[yeastar-webhook] Received action: ${action ?? 'unknown'} type: ${normalized.type ?? 'n/a'}`,
    JSON.stringify(body),
  );

  try {
    switch (action) {
      case 'NewCdr':
        await handleNewCdr(payload);
        break;
      case 'ExtensionStatus':
        await handleExtensionStatus(payload);
        break;
      case 'ExtensionPresence':
        await handlePresence(payload);
        break;
      case 'TrunkStatus':
        await handleTrunkStatus(payload);
        break;
      case 'IncomingCall':
        await handleIncomingCall(payload);
        break;
      default:
        console.log(
          `[yeastar-webhook] Unhandled action: ${action ?? 'undefined'} type: ${normalized.type ?? 'n/a'}`,
          JSON.stringify(payload),
        );
    }

    // Always return 200 — Yeastar will retry on non-2xx
    return new Response(JSON.stringify({ ok: true, action }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[yeastar-webhook] Handler error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// NewCdr — call has ended, write full CDR to calls table
// ═══════════════════════════════════════════════════════════
async function handleNewCdr(body: Record<string, unknown>) {
  const callid = String(body.callid ?? '');
  const timestart = String(body.timestart ?? '');
  const callfrom = String(body.callfrom ?? '');
  const callto = String(body.callto ?? '');
  const callduraction = Number(body.callduraction ?? 0);
  const talkduraction = Number(body.talkduraction ?? 0);
  const status = String(body.status ?? '');
  const did = String(body.did ?? callto);
  const recording = body.recording ? String(body.recording) : null;

  // Look up tenant and queue via DID mapping
  const { data: mapping } = await supabase
    .from('did_mappings')
    .select('tenant_id, queue_id')
    .eq('did', did)
    .maybeSingle();

  const tenantId = mapping?.tenant_id ?? 'unknown';
  const queueId = mapping?.queue_id ?? 'unknown';
  const callerName = await lookupCustomerName(tenantId, callfrom);

  // Parse times
  const startTime = parseYeastarDate(timestart);
  const endTime = new Date(startTime.getTime() + callduraction * 1000);
  const answerTime = talkduraction > 0
    ? new Date(startTime.getTime() + (callduraction - talkduraction) * 1000)
    : null;

  // Look up agent by extension number
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('extension', callto)
    .maybeSingle();

  // Upsert call record (idempotent on callid)
  const { error } = await supabase.from('calls').upsert({
    id: `yeastar-${callid}`,
    tenant_id: tenantId,
    queue_id: queueId,
    agent_id: agent?.id ?? null,
    caller_number: callfrom,
    caller_name: callerName,
    start_time: startTime.toISOString(),
    answer_time: answerTime?.toISOString() ?? null,
    end_time: endTime.toISOString(),
    duration_seconds: callduraction,
    result: mapYeastarStatus(status),
    recording_url: recording ? `${RECORDING_BASE_URL}/${recording}` : null,
    transcript_status: 'none',
    summary_status: 'none',
  }, { onConflict: 'id' });

  if (error) throw new Error(`calls upsert failed: ${error.message}`);

  // Reset agent status to available after call ends
  if (agent?.id) {
    await supabase.from('agents').update({
      status: 'available',
      current_caller: null,
      call_start_time: null,
    }).eq('id', agent.id);
  }

  // Remove the call from the live dashboard — CDR is the definitive end-of-call
  // signal, so this is the only place CallHangup should be broadcast.
  // (BYE events on IncomingCall only end one ring leg, not the whole call.)
  await supabase.channel('yeastar-incoming-calls').send({
    type: 'broadcast',
    event: 'CallHangup',
    payload: { id: `incoming-${callid}`, callerNumber: callfrom },
  });

  console.log(`[yeastar-webhook] NewCdr written + CallHangup broadcast: yeastar-${callid}`);
}

// ═══════════════════════════════════════════════════════════
// ExtensionStatus — agent picked up / hung up
// ═══════════════════════════════════════════════════════════
async function handleExtensionStatus(body: Record<string, unknown>) {
  const extension = String(body.extension ?? body.extnumber ?? '');
  const pbxStatus = String(body.status ?? body.extensionstatus ?? '');
  const callerid = body.callerid ? String(body.callerid) : body.callfrom ? String(body.callfrom) : null;

  const mapped = mapExtensionStatus(pbxStatus);
  const isActive = mapped.status === 'on-call' || mapped.status === 'ringing';

  const update: Record<string, unknown> = {
    status: mapped.status,
  };

  // Only clear caller data for EXPLICITLY known idle statuses (Idle, Registered,
  // Unavailable, etc).  Unknown / unmapped statuses must NOT wipe current_caller
  // because Yeastar often fires transient statuses mid-ring that would destroy
  // the caller number before the agent even sees the call in Linkus.
  if (!isActive && mapped.explicit) {
    update.current_caller = null;
    update.call_start_time = null;
  } else if (callerid && isActive) {
    update.current_caller = callerid;
    update.call_start_time = Date.now();
  }

  const { error } = await supabase
    .from('agents')
    .update(update)
    .eq('extension', extension);

  if (error) console.error(`[yeastar-webhook] ExtensionStatus update failed: ${error.message}`);
  else console.log(`[yeastar-webhook] Extension ${extension} → ${mapped.status}${mapped.explicit ? '' : ' (unmapped, caller preserved)'}`);
}

// ═══════════════════════════════════════════════════════════
// ExtensionPresence — agent went on break / DND / available
// ═══════════════════════════════════════════════════════════
async function handlePresence(body: Record<string, unknown>) {
  const extension = String(body.extension ?? body.extnumber ?? '');
  const presence = String(body.presence ?? '');

  const agentStatus = mapPresenceStatus(presence);

  const { error } = await supabase.from('agents').update({
    status: agentStatus,
  }).eq('extension', extension);

  if (error) console.error(`[yeastar-webhook] Presence update failed: ${error.message}`);
  else console.log(`[yeastar-webhook] Extension ${extension} presence → ${agentStatus}`);
}

// ═══════════════════════════════════════════════════════════
// TrunkStatus — SIP line registered or unregistered
// ═══════════════════════════════════════════════════════════
async function handleTrunkStatus(body: Record<string, unknown>) {
  const trunk = String(body.trunk ?? body.trunkname ?? '');
  const pbxStatus = String(body.status ?? '');

  const lineStatus: 'active' | 'idle' | 'error' =
    pbxStatus === 'Registered' ? 'idle' :
    pbxStatus === 'Active' ? 'active' : 'error';

  const { error } = await supabase.from('sip_lines').update({
    status: lineStatus,
  }).eq('trunk_name', trunk);

  if (error) console.error(`[yeastar-webhook] TrunkStatus update failed: ${error.message}`);
  else console.log(`[yeastar-webhook] Trunk ${trunk} → ${lineStatus}`);
}

// ═══════════════════════════════════════════════════════════
// IncomingCall — new call ringing on the PBX
// Broadcast via Supabase Realtime so the dashboard
// can show the live "incoming call" panel immediately.
// ═══════════════════════════════════════════════════════════
async function handleIncomingCall(body: Record<string, unknown>) {
  const did = String(body.did ?? body.did_number ?? body.to ?? body.callto ?? '');
  let callfrom = String(body.callfrom ?? body.from ?? '');
  const callid = String(body.callid ?? body.call_id ?? '');
  const extension = String(body.callto ?? body.to ?? body.extension ?? '');
  const trunkName = String(body.trunkname ?? body.trunk_name ?? body.src_trunk_name ?? '');
  const memberStatus = String(body.member_status ?? body.status ?? '').toUpperCase();

  // Yeastar re-ring / status-update events often arrive without callfrom.
  // Fall back to what the agent's DB record already holds so every broadcast
  // carries a caller number.
  if (!callfrom && extension) {
    const { data: agentRow } = await supabase
      .from('agents')
      .select('current_caller')
      .eq('extension', extension)
      .maybeSingle();
    if (agentRow?.current_caller) {
      callfrom = String(agentRow.current_caller);
    }
  }

  const context = await resolveIncomingContext({ did, extension, trunkName });
  const tenantId = context.tenantId;
  const callerName = await lookupCustomerName(tenantId, callfrom);

  const payload = {
    id: `incoming-${callid}`,
    did,
    callerNumber: callfrom,
    callerName,
    tenantId,
    tenantName: context.tenantName,
    tenantBrandColor: context.tenantBrandColor,
    queueId: context.queueId,
    queueName: context.queueName,
    groupId: context.queueId === 'unknown' ? '' : context.queueId,
    groupName: context.queueName === 'Inbound' ? '' : context.queueName,
    didLabel: context.didLabel || did || trunkName || extension,
    waitingSince: Date.now(),
    status: 'ringing' as const,
  };

  // BYE on an IncomingCall only means this ring *leg* ended (e.g. one queue
  // agent didn't answer).  The call itself is still live — the queue will ring
  // the next agent.  We must NOT fire CallHangup here; that would remove the
  // call from the dashboard and cause the "disappear / reappear broken" cycle.
  // The definitive end-of-call signal is the CDR (handleNewCdr), which fires
  // CallHangup once the call is truly over.
  if (memberStatus === 'BYE') {
    await updateAgentLiveCallState(extension, memberStatus, callfrom);
    console.log(`[yeastar-webhook] IncomingCall BYE (leg ended, call still active): ${callfrom} → ${did}`);
    return;
  }

  await updateAgentLiveCallState(extension, memberStatus, callfrom);

  await supabase.channel('yeastar-incoming-calls').send({
    type: 'broadcast',
    event: 'IncomingCall',
    payload,
  });

  console.log(`[yeastar-webhook] IncomingCall broadcast: ${callfrom} → ${did} (${memberStatus || 'RING'})`);
}

// ═══════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════

function parseYeastarDate(dateStr: string): Date {
  // Yeastar format: "2024-03-19 10:05:34"
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}

async function lookupCustomerName(tenantId: string, callerNumber: string): Promise<string | null> {
  if (!tenantId || tenantId === 'unknown') return null;

  const variants = buildPhoneLookupVariants(callerNumber);
  if (variants.length === 0) return null;
  const phoneFilter = variants
    .flatMap((variant) => [`phone_normalized.eq.${variant}`, `primary_phone.eq.${variant}`])
    .join(',');

  try {
    const { data, error } = await (supabase as unknown as { from: (table: string) => any })
      .from('customers')
      .select('name')
      .eq('tenant_id', tenantId)
      .or(phoneFilter)
      .maybeSingle();

    if (error) {
      console.warn(`[yeastar-webhook] Customer lookup failed: ${error.message}`);
      return null;
    }

    return data?.name ? String(data.name) : null;
  } catch (error) {
    console.warn('[yeastar-webhook] Customer lookup unavailable:', error);
    return null;
  }
}

function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function updateAgentLiveCallState(
  extension: string,
  memberStatus: string,
  callerNumber: string,
): Promise<void> {
  if (!extension) return;

  const s = memberStatus.toUpperCase();
  const isRinging = s === 'ALERT' || s === 'RING';
  const isAnswered = s === 'ANSWER' || s === 'ANSWERED';
  const isHangup = s === 'BYE';

  let update: Record<string, unknown>;

  if (isRinging) {
    update = { status: 'ringing' };
    // Only set caller fields when we actually have a number — re-ring events
    // from Yeastar often arrive without callfrom and must not erase the value
    // that was written by the first RING event.
    if (callerNumber) {
      update.current_caller = callerNumber;
      update.call_start_time = Date.now();
    }
  } else if (isAnswered) {
    update = {
      status: 'on-call',
      current_caller: callerNumber || null,
      call_start_time: Date.now(),
    };
  } else if (isHangup) {
    update = {
      status: 'available',
      current_caller: null,
      call_start_time: null,
    };
  } else {
    return;
  }

  const { error } = await supabase
    .from('agents')
    .update(update)
    .eq('extension', extension);

  if (error) {
    console.error(`[yeastar-webhook] Failed to sync live caller for ext ${extension}: ${error.message}`);
  }
}

function buildPhoneLookupVariants(phone: string): string[] {
  const raw = phone.trim();
  if (!raw) return [];

  const digits = raw.replace(/\D/g, '');
  if (!digits) return [];

  const variants = new Set<string>();

  variants.add(digits);
  variants.add(raw);
  if (raw.startsWith('+')) variants.add(raw.slice(1));

  if (digits.startsWith('94') && digits.length === 11) {
    const local = digits.slice(2);
    variants.add(`0${local}`);
    variants.add(local);
    variants.add(`+94${local}`);
  }

  if (digits.startsWith('0') && digits.length === 10) {
    const local = digits.slice(1);
    variants.add(`94${local}`);
    variants.add(`+94${local}`);
    variants.add(local);
  }

  if (!digits.startsWith('0') && !digits.startsWith('94') && digits.length === 9) {
    variants.add(`0${digits}`);
    variants.add(`94${digits}`);
    variants.add(`+94${digits}`);
  }

  return Array.from(variants);
}

async function resolveIncomingContext(args: {
  did: string;
  extension: string;
  trunkName: string;
}): Promise<{
  tenantId: string;
  tenantName: string;
  tenantBrandColor: string;
  queueId: string;
  queueName: string;
  didLabel: string;
}> {
  const { did, extension, trunkName } = args;

  if (did) {
    const { data: mapping } = await supabase
      .from('did_mappings')
      .select('tenant_id, queue_id, label, tenants(name, brand_color), queues(name)')
      .eq('did', did)
      .maybeSingle();

    if (mapping?.tenant_id) {
      return {
        tenantId: mapping.tenant_id,
        tenantName: (mapping as any)?.tenants?.name ?? 'Unknown',
        tenantBrandColor: (mapping as any)?.tenants?.brand_color ?? '#00d4f5',
        queueId: mapping.queue_id ?? 'unknown',
        queueName: (mapping as any)?.queues?.name ?? 'Inbound',
        didLabel: mapping.label ?? did,
      };
    }
  }

  if (extension) {
    const { data: agent } = await supabase
      .from('agents')
      .select('tenant_id, queue_ids, tenants(name, brand_color)')
      .eq('extension', extension)
      .maybeSingle();

    if (agent?.tenant_id) {
      const queueId = Array.isArray(agent.queue_ids) && agent.queue_ids.length > 0
        ? String(agent.queue_ids[0])
        : 'unknown';

      let queueName = 'Inbound';
      if (queueId !== 'unknown') {
        const { data: queue } = await supabase
          .from('queues')
          .select('name')
          .eq('id', queueId)
          .maybeSingle();
        queueName = queue?.name ?? queueName;
      }

      return {
        tenantId: agent.tenant_id,
        tenantName: (agent as any)?.tenants?.name ?? 'Unknown',
        tenantBrandColor: (agent as any)?.tenants?.brand_color ?? '#00d4f5',
        queueId,
        queueName,
        didLabel: trunkName || extension,
      };
    }
  }

  if (trunkName) {
    const { data: line } = await supabase
      .from('sip_lines')
      .select('tenant_id, label')
      .eq('trunk_name', trunkName)
      .maybeSingle();

    if (line?.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, brand_color')
        .eq('id', line.tenant_id)
        .maybeSingle();

      return {
        tenantId: line.tenant_id,
        tenantName: tenant?.name ?? 'Unknown',
        tenantBrandColor: tenant?.brand_color ?? '#00d4f5',
        queueId: 'unknown',
        queueName: 'Inbound',
        didLabel: line.label ?? trunkName,
      };
    }
  }

  return {
    tenantId: 'unknown',
    tenantName: 'Unknown',
    tenantBrandColor: '#00d4f5',
    queueId: 'unknown',
    queueName: 'Inbound',
    didLabel: did || trunkName || extension,
  };
}

function normalizeYeastarPayload(rawBody: Record<string, unknown>): {
  action?: string;
  payload: Record<string, unknown>;
  type?: number;
} {
  const explicitAction = typeof rawBody.action === 'string' ? rawBody.action : undefined;
  const type = typeof rawBody.type === 'number'
    ? rawBody.type
    : typeof rawBody.type === 'string' && rawBody.type.trim() !== ''
      ? Number(rawBody.type)
      : undefined;

  let payload: Record<string, unknown> = rawBody;
  const rawMsg = rawBody.msg;
  if (typeof rawMsg === 'string' && rawMsg.trim() !== '') {
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = { ...rawBody, ...(parsed as Record<string, unknown>) };
        payload = flattenYeastarPayload(type, payload);
      }
    } catch {
      console.warn('[yeastar-webhook] Failed to parse msg payload as JSON');
    }
  }

  const action = explicitAction ?? mapYeastarEventType(type) ?? inferActionFromPayload(payload);
  return { action, payload, type };
}

function mapYeastarEventType(type?: number): string | undefined {
  switch (type) {
    case 30008:
      return 'ExtensionStatus';
    case 30011:
    case 30016:
      return 'IncomingCall';
    case 30012:
      return 'NewCdr';
    default:
      return undefined;
  }
}

function inferActionFromPayload(payload: Record<string, unknown>): string | undefined {
  if (payload.action && typeof payload.action === 'string') return payload.action;

  if (payload.timestart || payload.callduraction || payload.talkduraction) {
    return 'NewCdr';
  }

  if (payload.time_start || payload.call_duration || payload.talk_duration) {
    return 'NewCdr';
  }

  if ((payload.extension || payload.extnumber) && payload.presence) {
    return 'ExtensionPresence';
  }

  if ((payload.extension || payload.extnumber) && (payload.status || payload.extensionstatus)) {
    return 'ExtensionStatus';
  }

  if ((payload.trunk || payload.trunkname) && payload.status) {
    return 'TrunkStatus';
  }

  if ((payload.did || payload.callto) && payload.callfrom && payload.callid) {
    return 'IncomingCall';
  }

  if ((payload.from || payload.callfrom) && (payload.to || payload.did || payload.callto) && (payload.call_id || payload.callid)) {
    return 'IncomingCall';
  }

  return undefined;
}

function flattenYeastarPayload(type: number | undefined, payload: Record<string, unknown>): Record<string, unknown> {
  if ((type === 30011 || type === 30016) && Array.isArray(payload.members) && payload.members.length > 0) {
    const firstMember = payload.members[0];
    if (firstMember && typeof firstMember === 'object' && !Array.isArray(firstMember)) {
      const inbound = (firstMember as Record<string, unknown>).inbound;
      if (inbound && typeof inbound === 'object' && !Array.isArray(inbound)) {
        const inboundInfo = inbound as Record<string, unknown>;
        return {
          ...payload,
          ...inboundInfo,
          callid: payload.call_id ?? inboundInfo.call_id,
          call_id: payload.call_id ?? inboundInfo.call_id,
          callfrom: inboundInfo.from,
          callto: inboundInfo.to,
          did: inboundInfo.to,
          trunkname: inboundInfo.trunk_name,
          status: inboundInfo.member_status,
          member_status: inboundInfo.member_status,
        };
      }
    }
  }

  if (type === 30012) {
    return {
      ...payload,
      callid: payload.call_id,
      timestart: payload.time_start,
      callfrom: payload.call_from,
      callto: payload.call_to,
      callduraction: payload.call_duration,
      talkduraction: payload.talk_duration,
      did: payload.did_number,
      did_number: payload.did_number,
      trunkname: payload.src_trunk_name,
      trunk_name: payload.src_trunk_name,
    };
  }

  return payload;
}

function mapYeastarStatus(status: string): 'answered' | 'abandoned' | 'missed' | 'voicemail' {
  switch (status.toUpperCase()) {
    case 'ANSWERED': return 'answered';
    case 'NO ANSWER': return 'missed';
    case 'BUSY': return 'abandoned';
    case 'VOICEMAIL': return 'voicemail';
    case 'FAILED': return 'missed';
    default: return 'missed';
  }
}

function mapExtensionStatus(status: string): { status: 'ringing' | 'on-call' | 'available' | 'wrap-up' | 'break' | 'offline'; explicit: boolean } {
  switch (status) {
    case 'Ringing':
    case 'RING':
    case 'ALERT':
      return { status: 'ringing', explicit: true };
    case 'Busy':
    case 'InUse':
    case 'ANSWER':
    case 'ANSWERED':
      return { status: 'on-call', explicit: true };
    case 'Idle':
    case 'Registered':
      return { status: 'available', explicit: true };
    case 'Unavailable':
    case 'Unregistered':
      return { status: 'offline', explicit: true };
    case 'DoNotDisturb':
      return { status: 'break', explicit: true };
    default:
      console.warn(`[yeastar-webhook] Unmapped extension status: "${status}", defaulting to available (caller data preserved)`);
      return { status: 'available', explicit: false };
  }
}

function mapPresenceStatus(presence: string): 'on-call' | 'available' | 'wrap-up' | 'break' | 'offline' {
  switch (presence) {
    case 'Away': return 'break';
    case 'DoNotDisturb': return 'break';
    case 'Break': return 'break';
    case 'Lunch': return 'break';
    case 'Available': return 'available';
    case 'Offline': return 'offline';
    default: return 'available';
  }
}
