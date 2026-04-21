import { useState, useEffect, useCallback } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Mic,
  MicOff,
  Pause,
  Play,
  ChevronDown,
  Delete,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PhoneIncoming,
  Volume2,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLinkusSDK, type ActiveCallInfo, type SoftphoneStatus } from '@/hooks/useLinkusSDK';
import type { MicPermission } from '@/hooks/useLinkusSDK';
import { clearCachedSdkSign } from '@/services/linkusSdkService';

// ─── helpers ───────────────────────────────────────────────

function formatDuration(startTime: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - startTime) / 1000));
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const STATUS_META: Record<
  SoftphoneStatus,
  { label: string; dot: string; badge: string }
> = {
  idle: {
    label: 'Offline',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600',
  },
  initializing: {
    label: 'Connecting…',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'bg-amber-50 text-amber-700',
  },
  registered: {
    label: 'Ready',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  ringing: {
    label: 'Incoming',
    dot: 'bg-sky-500 animate-pulse',
    badge: 'bg-sky-50 text-sky-700',
  },
  'on-call': {
    label: 'On Call',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700',
  },
  'ip-forbidden': {
    label: 'IP Blocked',
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700',
  },
  error: {
    label: 'Error',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700',
  },
};

const DIALPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

// ─── Sub-components ────────────────────────────────────────

function IncomingCallCard({
  call,
  onAnswer,
  onReject,
}: {
  call: ActiveCallInfo;
  onAnswer: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
        </span>
        <span className="text-xs font-semibold text-sky-700">Incoming Call</span>
      </div>
      <p className="truncate text-sm font-semibold text-slate-900">
        {call.name || call.number}
      </p>
      {call.name && (
        <p className="truncate text-xs text-slate-500">{call.number}</p>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          className="flex-1 bg-emerald-500 text-white hover:bg-emerald-600"
          onClick={onAnswer}
        >
          <Phone className="mr-1 h-3 w-3" />
          Answer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
          onClick={onReject}
        >
          <PhoneOff className="mr-1 h-3 w-3" />
          Reject
        </Button>
      </div>
    </div>
  );
}

function ActiveCallCard({
  call,
  now,
  onHangup,
  onHold,
  onMute,
}: {
  call: ActiveCallInfo;
  now: number;
  onHangup: () => void;
  onHold: () => void;
  onMute: () => void;
}) {
  const isConnected = call.callStatus === 'talking';
  const isDialling = call.callStatus === 'calling' || call.callStatus === 'ringing';

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-violet-700">
          {isDialling
            ? 'Calling…'
            : call.isHeld
            ? 'On Hold'
            : 'Active Call'}
        </span>
        <div className="flex items-center gap-1.5">
          {isConnected && !call.isMuted && (
            <Volume2 className="h-3 w-3 text-violet-400" title="Audio active" />
          )}
          {isConnected && (
            <span className="font-mono text-xs text-violet-600">
              {formatDuration(call.startTime, now)}
            </span>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-200 text-violet-700">
          <PhoneCall className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {call.name || call.number}
          </p>
          {call.name && (
            <p className="truncate text-xs text-slate-500">{call.number}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {/* Hold / unhold */}
        <Button
          size="sm"
          variant="outline"
          className={`flex-1 ${
            call.isHeld
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          onClick={onHold}
          title={call.isHeld ? 'Resume' : 'Hold'}
        >
          {call.isHeld ? (
            <Play className="h-3 w-3" />
          ) : (
            <Pause className="h-3 w-3" />
          )}
        </Button>

        {/* Mute / unmute */}
        <Button
          size="sm"
          variant="outline"
          className={`flex-1 ${
            call.isMuted
              ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          onClick={onMute}
          title={call.isMuted ? 'Unmute' : 'Mute'}
        >
          {call.isMuted ? (
            <MicOff className="h-3 w-3" />
          ) : (
            <Mic className="h-3 w-3" />
          )}
        </Button>

        {/* Hangup */}
        <Button
          size="sm"
          className="flex-1 bg-rose-500 text-white hover:bg-rose-600"
          onClick={onHangup}
          title="Hang up"
        >
          <PhoneOff className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main widget ───────────────────────────────────────────

interface SoftphoneWidgetProps {
  /** The agent's Yeastar-registered email address. */
  agentEmail: string | null | undefined;
}

async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export function SoftphoneWidget({ agentEmail }: SoftphoneWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dialInput, setDialInput] = useState('');
  const [now, setNow] = useState(Date.now());

  const sdk = useLinkusSDK({ agentEmail });
  const meta = STATUS_META[sdk.status];

  // Tick every second for live call timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-open when a call arrives
  useEffect(() => {
    if (sdk.incomingCalls.length > 0 || sdk.primaryActiveCall) {
      setIsOpen(true);
    }
  }, [sdk.incomingCalls.length, sdk.primaryActiveCall]);

  const handleDialKey = useCallback(
    (key: string) => setDialInput((prev) => prev + key),
    []
  );

  const handleBackspace = useCallback(
    () => setDialInput((prev) => prev.slice(0, -1)),
    []
  );

  const handleCall = useCallback(() => {
    if (!dialInput) return;
    // Strip everything the PBX can't dial — spaces, dashes, parentheses, dots.
    // Keep digits and valid SIP dialing characters (+, *, #).
    const sanitized = dialInput.replace(/[^0-9+*#]/g, '');
    if (!sanitized) {
      console.warn('[SoftphoneWidget] Dial input had no valid digits:', dialInput);
      return;
    }
    sdk.makeCall(sanitized).catch((err) =>
      console.error('[SoftphoneWidget] Call failed:', err)
    );
    setDialInput('');
  }, [dialInput, sdk]);

  // Don't render at all if no email → not an agent with PBX access
  if (!agentEmail) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2"
      aria-label="Softphone"
    >
      {/* Expanded panel */}
      {isOpen && (
        <div className="w-72 overflow-hidden rounded-2xl border border-border bg-white shadow-2xl shadow-slate-200 ring-1 ring-slate-100">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${meta.dot}`}
              />
              <span className="text-sm font-semibold text-slate-800">
                Softphone
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs ${meta.badge}`}>{meta.label}</Badge>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label="Minimise"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3 p-3">
            {/* Initialising */}
            {sdk.status === 'initializing' && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting to PBX…
              </div>
            )}

            {/* IP FORBIDDEN — needs one-time whitelisted-IP login */}
            {sdk.status === 'ip-forbidden' && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0 text-orange-600" />
                  <span className="text-xs font-semibold text-orange-700">
                    IP Address Blocked (error 70087)
                  </span>
                </div>
                <p className="mb-2 text-xs text-orange-700">
                  The Yeastar PBX is rejecting this request from your current
                  network. You need to connect <strong>once</strong> from a
                  whitelisted IP to generate your sign.
                </p>
                <p className="mb-3 text-xs font-medium text-orange-800">
                  Fix options:
                </p>
                <ol className="mb-3 list-inside list-decimal space-y-1 text-xs text-orange-700">
                  <li>
                    Log into the Yeastar admin portal →{' '}
                    <strong>Integrations → Linkus SDK</strong> → remove the
                    IP restriction
                  </li>
                  <li>
                    Or connect from the <strong>office network / VPN</strong>{' '}
                    once — the sign is cached locally and all future logins
                    will work from any IP
                  </li>
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                  onClick={() => {
                    if (agentEmail) clearCachedSdkSign(agentEmail);
                    window.location.reload();
                  }}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}

            {/* Microphone denied */}
            {sdk.micPermission === 'denied' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="mb-2 flex items-start gap-2 text-xs text-rose-700">
                  <MicOff className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Microphone access is blocked. Click the 🔒 icon in your
                    browser's address bar, allow <em>Microphone</em>, then
                    refresh the page.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-rose-200 text-rose-700 hover:bg-rose-100"
                  onClick={async () => {
                    const ok = await requestMicPermission();
                    if (ok) window.location.reload();
                  }}
                >
                  <Mic className="mr-1 h-3 w-3" />
                  Allow Microphone
                </Button>
              </div>
            )}

            {/* Error (non-mic) */}
            {sdk.status === 'error' && sdk.micPermission !== 'denied' && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{sdk.error ?? 'Connection failed'}</span>
              </div>
            )}

            {/* Ready banner */}
            {sdk.status === 'registered' && sdk.incomingCalls.length === 0 && !sdk.primaryActiveCall && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Registered &amp; ready
              </div>
            )}

            {/* Incoming calls */}
            {sdk.incomingCalls.map((call) => (
              <IncomingCallCard
                key={call.callId}
                call={call}
                onAnswer={() => sdk.answer(call.callId)}
                onReject={() => sdk.reject(call.callId)}
              />
            ))}

            {/* Active calls (non-incoming) */}
            {sdk.activeCalls
              .filter((c) => !sdk.incomingCalls.some((i) => i.callId === c.callId))
              .map((call) => (
                <ActiveCallCard
                  key={call.callId}
                  call={call}
                  now={now}
                  onHangup={() => sdk.hangup(call.callId)}
                  onHold={() =>
                    call.isHeld
                      ? sdk.unhold(call.callId)
                      : sdk.hold(call.callId)
                  }
                  onMute={() =>
                    call.isMuted
                      ? sdk.unmute(call.callId)
                      : sdk.mute(call.callId)
                  }
                />
              ))}

            {/* Dial pad — only show when registered and not on a call */}
            {(sdk.status === 'registered' || sdk.status === 'on-call') && (
              <div>
                {/* Number input */}
                <div className="mb-2 flex items-center gap-1 rounded-lg border border-border bg-slate-50 px-3 py-2">
                  <input
                    type="text"
                    value={dialInput}
                    onChange={(e) => setDialInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCall();
                    }}
                    placeholder="Enter number…"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  {dialInput && (
                    <button
                      onClick={handleBackspace}
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Backspace"
                    >
                      <Delete className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-1">
                  {DIALPAD_KEYS.flat().map((key) => (
                    <button
                      key={key}
                      onClick={() => handleDialKey(key)}
                      className="rounded-lg border border-border bg-slate-50 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
                    >
                      {key}
                    </button>
                  ))}
                </div>

                {/* Call button */}
                <Button
                  className="mt-2 w-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={!dialInput}
                  onClick={handleCall}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Call
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsed toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 ${
          sdk.status === 'ringing'
            ? 'animate-bounce bg-sky-500 text-white'
            : sdk.status === 'on-call'
            ? 'bg-violet-600 text-white'
            : sdk.status === 'ip-forbidden'
            ? 'bg-orange-500 text-white'
            : sdk.status === 'error'
            ? 'bg-rose-500 text-white'
            : sdk.status === 'registered'
            ? 'bg-emerald-500 text-white'
            : 'bg-slate-700 text-white'
        }`}
        aria-label={isOpen ? 'Minimise softphone' : 'Open softphone'}
      >
        {sdk.status === 'initializing' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : sdk.status === 'ringing' ? (
          <PhoneIncoming className="h-5 w-5" />
        ) : sdk.status === 'on-call' ? (
          <PhoneCall className="h-5 w-5" />
        ) : sdk.status === 'ip-forbidden' ? (
          <ShieldAlert className="h-5 w-5" />
        ) : sdk.micPermission === 'denied' ? (
          <MicOff className="h-5 w-5" />
        ) : sdk.status === 'error' ? (
          <PhoneMissed className="h-5 w-5" />
        ) : isOpen ? (
          <ChevronDown className="h-5 w-5" />
        ) : (
          <Phone className="h-5 w-5" />
        )}

        {/* Status dot */}
        <span
          className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${meta.dot}`}
        />

        {/* Incoming call badge count */}
        {sdk.incomingCalls.length > 0 && (
          <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {sdk.incomingCalls.length}
          </span>
        )}
      </button>
    </div>
  );
}
