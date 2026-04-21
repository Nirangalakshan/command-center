import { useState, useEffect, useRef, useCallback } from 'react';
import { init } from 'ys-webrtc-sdk-core';
import type { PhoneOperator, PBXOperator, CallStatus } from 'ys-webrtc-sdk-core';
import {
  fetchSdkSign,
  LINKUS_PBX_URL,
  IpForbiddenError,
  clearCachedSdkSign,
} from '@/services/linkusSdkService';

export type MicPermission = 'unknown' | 'granted' | 'denied';

// ─── Public types ──────────────────────────────────────────

export type SoftphoneStatus =
  | 'idle'
  | 'initializing'
  | 'registered'
  | 'ringing'
  | 'on-call'
  | 'ip-forbidden'   // Yeastar PBX blocked this IP — needs whitelisted-IP login
  | 'error';

export interface ActiveCallInfo {
  callId: string;
  number: string;
  name: string;
  direction: 'inbound' | 'outbound';
  /** ringing = outbound dialling, calling = remote ringing, talking = connected */
  callStatus: 'ringing' | 'calling' | 'talking' | 'connecting';
  isHeld: boolean;
  isMuted: boolean;
  /** Unix ms — when the call was established (callStartTime from SDK) */
  startTime: number;
}

// ─── Internal helpers ──────────────────────────────────────

function mapSdkStatus(s: CallStatus): ActiveCallInfo {
  return {
    callId: s.callId,
    number: s.number,
    name: s.name,
    direction: s.communicationType,
    callStatus: s.callStatus,
    isHeld: s.isHold,
    isMuted: s.isMute,
    startTime: s.callStartTime,
  };
}

function deriveStatus(
  incomingIds: string[],
  calls: Map<string, ActiveCallInfo>,
  registered: boolean,
  override?: SoftphoneStatus
): SoftphoneStatus {
  if (override === 'ip-forbidden' || override === 'error' || override === 'initializing' || override === 'idle') {
    return override;
  }
  if (!registered) return 'idle';
  if (incomingIds.length > 0) return 'ringing';
  if (calls.size > 0) return 'on-call';
  return 'registered';
}

// ─── Hook ──────────────────────────────────────────────────

interface UseLinkusSdkOptions {
  /** The agent's Yeastar-registered email. Pass null/undefined to stay idle. */
  agentEmail: string | null | undefined;
}

// ─── Audio helpers ─────────────────────────────────────────

const AUDIO_ELEMENT_ID = '__softphone_remote_audio__';

function getOrCreateAudio(): HTMLAudioElement {
  let el = document.getElementById(AUDIO_ELEMENT_ID) as HTMLAudioElement | null;
  if (!el) {
    el = document.createElement('audio');
    el.id = AUDIO_ELEMENT_ID;
    el.autoplay = true;
    el.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
  }
  return el;
}

function attachRemoteStream(stream: unknown) {
  // The SDK occasionally emits updateRemoteStream with undefined/null
  // during teardown. Ignore anything that isn't a real MediaStream.
  if (!(stream instanceof MediaStream)) return;
  const audio = getOrCreateAudio();
  if (audio.srcObject !== stream) {
    audio.srcObject = stream;
    audio.play().catch(() => {
      // Autoplay blocked — will retry on next user gesture
    });
  }
}

function detachAudio() {
  const el = document.getElementById(AUDIO_ELEMENT_ID) as HTMLAudioElement | null;
  if (el) {
    el.srcObject = null;
    el.pause();
  }
}

// ─── Hook ──────────────────────────────────────────────────

export function useLinkusSDK({ agentEmail }: UseLinkusSdkOptions) {
  const [status, setStatus] = useState<SoftphoneStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown');
  const [activeCalls, setActiveCalls] = useState<Map<string, ActiveCallInfo>>(
    new Map()
  );
  const [incomingCallIds, setIncomingCallIds] = useState<string[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);

  const phoneRef = useRef<PhoneOperator | null>(null);
  const pbxRef = useRef<PBXOperator | null>(null);

  // Derive combined status — only keep terminal states (ip-forbidden, error)
  // sticky. 'initializing' must unlock once registration succeeds, otherwise
  // the UI gets stuck on "Connecting to PBX…" even after the SDK registers.
  useEffect(() => {
    setStatus((prev) => {
      if (prev === 'ip-forbidden' || prev === 'error') {
        return prev;
      }
      return deriveStatus(incomingCallIds, activeCalls, isRegistered);
    });
  }, [incomingCallIds, activeCalls, isRegistered]);

  const upsertCall = useCallback((sdkStatus: CallStatus) => {
    setActiveCalls((prev) => {
      const next = new Map(prev);
      next.set(sdkStatus.callId, mapSdkStatus(sdkStatus));
      return next;
    });
  }, []);

  const removeCall = useCallback((callId: string) => {
    setActiveCalls((prev) => {
      if (!prev.has(callId)) return prev;
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
    setIncomingCallIds((prev) =>
      prev.includes(callId) ? prev.filter((id) => id !== callId) : prev
    );
  }, []);

  const dismissIncoming = useCallback((callId: string) => {
    setIncomingCallIds((prev) =>
      prev.includes(callId) ? prev.filter((id) => id !== callId) : prev
    );
  }, []);

  // ── SDK lifecycle ────────────────────────────────────────
  useEffect(() => {
    if (!agentEmail || !LINKUS_PBX_URL) {
      setStatus('idle');
      setIsRegistered(false);
      return;
    }

    let cancelled = false;
    let destroyFn: (() => void) | null = null;

    async function bootstrap() {
      setStatus('initializing');
      setError(null);

      // ── Step 0: verify microphone access ────────────────
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop()); // permission granted; release immediately
        if (cancelled) return;
        setMicPermission('granted');
      } catch {
        if (cancelled) return;
        setMicPermission('denied');
        setStatus('error');
        setError(
          'Microphone access denied. Allow microphone in your browser settings and refresh.'
        );
        return;
      }

      try {
        // Try to initialise the SDK. If we hit PBX_API_ERROR (-103), the most
        // common cause is a stale cached sign — clear it and retry once with a
        // freshly-generated sign before giving up.
        const tryInit = async () => {
          const sign = await fetchSdkSign(agentEmail!);
          if (cancelled) return null;
          console.log('[useLinkusSDK] Initialising SDK', {
            username: agentEmail,
            pbxURL: LINKUS_PBX_URL,
            signLen: sign?.length ?? 0,
          });
          return init({
            username: agentEmail!,
            secret: sign,
            pbxURL: LINKUS_PBX_URL,
            enableLog: import.meta.env.DEV,
          });
        };

        let operator: Awaited<ReturnType<typeof init>> | null = null;
        try {
          operator = await tryInit();
        } catch (err) {
          const info = err as { code?: number; message?: string };
          const isPbxApiError =
            info?.code === -103 ||
            (typeof info?.message === 'string' &&
              info.message.includes('PBX_API_ERROR'));

          if (isPbxApiError && !cancelled) {
            console.warn(
              '[useLinkusSDK] PBX_API_ERROR on first init — clearing cached sign and retrying once'
            );
            clearCachedSdkSign(agentEmail!);
            operator = await tryInit();
          } else {
            throw err;
          }
        }

        if (cancelled || !operator) {
          operator?.destroy();
          return;
        }

        const { phone, pbx, destroy } = operator;
        phoneRef.current = phone;
        pbxRef.current = pbx;
        destroyFn = destroy;

        // ── Registration events ──────────────────────────
        phone.on('registered', () => {
          if (cancelled) return;
          console.log('[useLinkusSDK] SIP registered');
          setIsRegistered(true);
          setError(null);
        });

        phone.on('registrationFailed', (info: unknown) => {
          if (cancelled) return;
          console.error('[useLinkusSDK] SIP registration failed', info);
          setIsRegistered(false);
          setStatus('error');
          setError('SIP registration failed — check extension credentials');
        });

        phone.on('disconnected', (info: unknown) => {
          if (cancelled) return;
          console.warn('[useLinkusSDK] SIP disconnected', info);
          setIsRegistered(false);
        });

        phone.on('isRegisteredChange', (reg: boolean) => {
          if (cancelled) return;
          console.log('[useLinkusSDK] isRegisteredChange →', reg);
          setIsRegistered(reg);
        });

        // ── New session (outbound or inbound) ─────────────
        phone.on('newRTCSession', ({
          callId,
          session,
        }: {
          callId: string;
          session: {
            status: CallStatus;
            remoteStream: MediaStream;
            on: (ev: string, cb: (...a: unknown[]) => void) => void;
          };
        }) => {
          if (cancelled) return;
          console.log('[useLinkusSDK] newRTCSession', callId, session.status.callStatus, session.status.communicationType);

          upsertCall(session.status);

          session.on('statusChange', () => {
            if (cancelled) return;
            upsertCall(session.status);
            // Once the call is 'talking' it is no longer an incoming ring —
            // clear it from the incoming list in case `startSession` / `accepted`
            // didn't fire reliably for this call.
            if (session.status.callStatus === 'talking') {
              dismissIncoming(callId);
            }
          });

          session.on('accepted', () => {
            if (cancelled) return;
            console.log('[useLinkusSDK] session accepted', callId);
            dismissIncoming(callId);
            upsertCall(session.status);
          });

          session.on('confirmed', () => {
            if (cancelled) return;
            console.log('[useLinkusSDK] session confirmed', callId);
            dismissIncoming(callId);
            upsertCall(session.status);
            // Attach audio as soon as the call is confirmed (both sides connected)
            if (session.remoteStream) attachRemoteStream(session.remoteStream);
          });

          // updateRemoteStream fires whenever the MediaStream track changes.
          // The stream arg can be undefined during teardown — attachRemoteStream
          // guards against that.
          session.on('updateRemoteStream', (stream: unknown) => {
            if (!cancelled) attachRemoteStream(stream);
          });

          session.on('ended', () => {
            if (cancelled) return;
            console.log('[useLinkusSDK] session ended', callId);
            removeCall(callId);
            if ((phoneRef.current?.sessions.size ?? 0) === 0) detachAudio();
          });

          session.on('failed', (info: unknown) => {
            if (cancelled) return;
            console.log('[useLinkusSDK] session failed', callId, info);
            removeCall(callId);
            if ((phoneRef.current?.sessions.size ?? 0) === 0) detachAudio();
          });
        });

        // ── Incoming call ─────────────────────────────────
        phone.on('incoming', ({ callId }: { callId: string }) => {
          if (cancelled) return;
          console.log('[useLinkusSDK] incoming', callId);
          setIncomingCallIds((prev) =>
            prev.includes(callId) ? prev : [...prev, callId]
          );
        });

        // ── Session established (answered / outbound connected) ─
        phone.on('startSession', ({ callId }: { callId: string }) => {
          if (cancelled) return;
          console.log('[useLinkusSDK] startSession', callId);
          dismissIncoming(callId);
        });

        // ── Session removed (missed, rejected, hung up, etc.) ──
        phone.on('deleteSession', ({ callId }: { callId: string }) => {
          if (cancelled) return;
          console.log('[useLinkusSDK] deleteSession', callId);
          removeCall(callId);
          if ((phoneRef.current?.sessions.size ?? 0) === 0) detachAudio();
        });

        // PBX-level runtime errors (licence issues, logged in elsewhere, etc.)
        pbx.on('runtimeError', (result: { code: number; message: string }) => {
          if (cancelled) return;
          console.error('[useLinkusSDK] PBX runtime error:', result);
          setStatus('error');
          setError(`PBX error ${result.code}: ${result.message}`);
        });

        console.log('[useLinkusSDK] Calling phone.start() — awaiting SIP registration');
        phone.start();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof IpForbiddenError) {
          setStatus('ip-forbidden');
          setError(null);
          return;
        }

        const info = err as { code?: number; message?: string };
        const raw = info?.message ?? (err instanceof Error ? err.message : String(err));
        console.error('[useLinkusSDK] Bootstrap failed:', err);

        // Map known Yeastar SDK error codes/messages to actionable guidance.
        let friendly = raw;
        if (info?.code === -103 || raw.includes('PBX_API_ERROR')) {
          friendly =
            `Yeastar PBX rejected the softphone login (${agentEmail}). ` +
            `Verify that an extension on the PBX has this email set and that ` +
            `Linkus is enabled for that extension.`;
        } else if (raw.includes('LINKUS_DISABLED')) {
          friendly = 'Linkus is disabled for this extension on the Yeastar PBX.';
        } else if (raw.includes('LOGGED_IN_ELSEWHERE')) {
          friendly =
            'This extension is already logged in elsewhere (max concurrent Linkus sessions reached). Log out of other Linkus clients and retry.';
        } else if (raw.includes('EXTENSION_DELETED')) {
          friendly = 'This extension has been deleted on the Yeastar PBX.';
        } else if (raw.includes('SDK_PLAN_DISABLED')) {
          friendly = 'Yeastar Linkus SDK plan is disabled / expired on this PBX.';
        } else if (raw.includes('PBX_NETWORK_ERROR')) {
          friendly =
            'Could not reach the Yeastar PBX. Check VITE_YEASTAR_PBX_URL and network connectivity.';
        } else if (raw.includes('REGISTRY_FAILED')) {
          friendly = 'SIP registration failed — check extension credentials and Linkus concurrency limit.';
        }

        setStatus('error');
        setError(friendly);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      destroyFn?.();
      phoneRef.current = null;
      pbxRef.current = null;
      detachAudio();
      setIsRegistered(false);
      setActiveCalls(new Map());
      setIncomingCallIds([]);
    };
  }, [agentEmail, upsertCall, removeCall, dismissIncoming]);

  // ── Exposed call controls ────────────────────────────────

  const makeCall = useCallback(
    async (number: string) => {
      if (!phoneRef.current) throw new Error('Phone not initialised');
      await phoneRef.current.call(number);
    },
    []
  );

  const answer = useCallback(
    async (callId: string) => {
      // Optimistically dismiss the incoming-call UI immediately so the widget
      // transitions from "Incoming" → "On Call" without waiting for
      // startSession / accepted events (which can race).
      dismissIncoming(callId);
      try {
        await phoneRef.current?.answer(callId);
      } catch (err) {
        console.error('[useLinkusSDK] answer failed', err);
        // If answer failed, the session will be torn down by the SDK and
        // deleteSession will clean up activeCalls.
      }
    },
    [dismissIncoming]
  );

  const reject = useCallback(
    (callId: string) => {
      // Call the SDK FIRST (while the session is still in a valid state),
      // THEN optimistically update local state. Doing it the other way around
      // can leave the session referenced but already-torn-down, which causes
      // JsSIP's "Invalid status" error on subsequent SDK calls.
      const phone = phoneRef.current;
      if (phone?.getSession(callId)) {
        try {
          phone.reject(callId);
        } catch (err) {
          // Session may already be terminated (remote side cancelled) — safe to ignore.
          console.warn('[useLinkusSDK] reject ignored:', err);
        }
      }
      dismissIncoming(callId);
      removeCall(callId);
    },
    [dismissIncoming, removeCall]
  );

  const hangup = useCallback(
    (callId: string) => {
      const phone = phoneRef.current;
      // Only invoke the SDK if the session is still alive on the SDK side.
      // If it's already gone (remote hung up, we already rejected, etc.),
      // calling phone.hangup() throws "Invalid status: 8" from JsSIP.
      if (phone?.getSession(callId)) {
        try {
          phone.hangup(callId);
        } catch (err) {
          console.warn('[useLinkusSDK] hangup ignored:', err);
        }
      }
      removeCall(callId);
      if ((phoneRef.current?.sessions.size ?? 0) === 0) detachAudio();
    },
    [removeCall]
  );

  // Small helper to safely invoke an SDK action that can throw
  // "Invalid status" / similar if the session is already torn down.
  const safeSessionAction = useCallback(
    (callId: string, label: string, fn: (callId: string) => void) => {
      const phone = phoneRef.current;
      if (!phone?.getSession(callId)) return;
      try {
        fn(callId);
      } catch (err) {
        console.warn(`[useLinkusSDK] ${label} ignored:`, err);
      }
    },
    []
  );

  const hold = useCallback((callId: string) => {
    safeSessionAction(callId, 'hold', (id) => phoneRef.current?.hold(id));
  }, [safeSessionAction]);

  const unhold = useCallback((callId: string) => {
    safeSessionAction(callId, 'unhold', (id) => phoneRef.current?.unhold(id));
  }, [safeSessionAction]);

  const mute = useCallback((callId: string) => {
    safeSessionAction(callId, 'mute', (id) => phoneRef.current?.mute(id));
  }, [safeSessionAction]);

  const unmute = useCallback((callId: string) => {
    safeSessionAction(callId, 'unmute', (id) => phoneRef.current?.unmute(id));
  }, [safeSessionAction]);

  const dtmf = useCallback((callId: string, digit: string) => {
    safeSessionAction(callId, 'dtmf', (id) => phoneRef.current?.dtmf(id, digit));
  }, [safeSessionAction]);

  // ── Derived lists ────────────────────────────────────────

  const activeCallsList = Array.from(activeCalls.values());

  const incomingCalls = incomingCallIds
    .map((id) => activeCalls.get(id))
    .filter((c): c is ActiveCallInfo => c !== undefined);

  const primaryActiveCall =
    activeCallsList.find(
      (c) => c.callStatus === 'talking' || c.callStatus === 'connecting'
    ) ?? null;

  return {
    status,
    error,
    micPermission,
    activeCalls: activeCallsList,
    incomingCalls,
    primaryActiveCall,
    makeCall,
    answer,
    reject,
    hangup,
    hold,
    unhold,
    mute,
    unmute,
    dtmf,
  };
}
