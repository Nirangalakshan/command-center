import { useState, useEffect, useRef, useCallback } from 'react';
import { init } from 'ys-webrtc-sdk-core';
import type { PhoneOperator, PBXOperator, CallStatus } from 'ys-webrtc-sdk-core';
import { fetchSdkSign, LINKUS_PBX_URL, IpForbiddenError } from '@/services/linkusSdkService';

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

function attachRemoteStream(stream: MediaStream) {
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

  // Derive combined status — but don't overwrite terminal states set by the
  // bootstrap function (ip-forbidden, error) with a derived 'idle'.
  useEffect(() => {
    setStatus((prev) => {
      if (prev === 'ip-forbidden' || prev === 'error' || prev === 'initializing') {
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
    setIncomingCallIds((prev) => prev.filter((id) => id !== callId));
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
        const sign = await fetchSdkSign(agentEmail!);
        if (cancelled) return;

        const operator = await init({
          username: agentEmail!,
          secret: sign,
          pbxURL: LINKUS_PBX_URL,
          enableLog: false,
        });

        if (cancelled) {
          operator.destroy();
          return;
        }

        const { phone, pbx, destroy } = operator;
        phoneRef.current = phone;
        pbxRef.current = pbx;
        destroyFn = destroy;

        // ── Registration events ──────────────────────────
        phone.on('registered', () => {
          if (cancelled) return;
          setIsRegistered(true);
          setError(null);
        });

        phone.on('registrationFailed', () => {
          if (cancelled) return;
          setIsRegistered(false);
          setStatus('error');
          setError('SIP registration failed — check extension credentials');
        });

        phone.on('disconnected', () => {
          if (cancelled) return;
          setIsRegistered(false);
        });

        phone.on('isRegisteredChange', (reg: boolean) => {
          if (cancelled) return;
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

          upsertCall(session.status);

          session.on('statusChange', () => {
            if (!cancelled) upsertCall(session.status);
          });

          session.on('confirmed', () => {
            if (!cancelled) {
              upsertCall(session.status);
              // Attach audio as soon as the call is confirmed (both sides connected)
              if (session.remoteStream) attachRemoteStream(session.remoteStream);
            }
          });

          // updateRemoteStream fires whenever the MediaStream track changes
          session.on('updateRemoteStream', (stream: unknown) => {
            if (!cancelled) attachRemoteStream(stream as MediaStream);
          });

          session.on('ended', () => {
            if (!cancelled) {
              removeCall(callId);
              // Stop audio if no other calls are active
              if ((phoneRef.current?.sessions.size ?? 0) === 0) detachAudio();
            }
          });

          session.on('failed', () => {
            if (!cancelled) {
              removeCall(callId);
              if ((phoneRef.current?.sessions.size ?? 0) === 0) detachAudio();
            }
          });
        });

        // ── Incoming call ─────────────────────────────────
        phone.on('incoming', ({ callId }: { callId: string }) => {
          if (cancelled) return;
          setIncomingCallIds((prev) =>
            prev.includes(callId) ? prev : [...prev, callId]
          );
        });

        // ── Session established (answered / outbound connected) ─
        phone.on('startSession', ({ callId }: { callId: string }) => {
          if (cancelled) return;
          // Remove from incoming list — it's now an active call
          setIncomingCallIds((prev) => prev.filter((id) => id !== callId));
        });

        // ── Session removed ───────────────────────────────
        phone.on('deleteSession', ({ callId }: { callId: string }) => {
          if (!cancelled) removeCall(callId);
        });

        // PBX-level runtime errors (licence issues, logged in elsewhere, etc.)
        pbx.on('runtimeError', (result: { code: number; message: string }) => {
          if (cancelled) return;
          console.error('[useLinkusSDK] PBX runtime error:', result);
          setStatus('error');
          setError(`PBX error ${result.code}: ${result.message}`);
        });

        phone.start();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof IpForbiddenError) {
          setStatus('ip-forbidden');
          setError(null);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setStatus('error');
          setError(msg);
        }
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
  }, [agentEmail, upsertCall, removeCall]);

  // ── Exposed call controls ────────────────────────────────

  const makeCall = useCallback(
    async (number: string) => {
      if (!phoneRef.current) throw new Error('Phone not initialised');
      await phoneRef.current.call(number);
    },
    []
  );

  const answer = useCallback(async (callId: string) => {
    await phoneRef.current?.answer(callId);
  }, []);

  const reject = useCallback((callId: string) => {
    phoneRef.current?.reject(callId);
  }, []);

  const hangup = useCallback((callId: string) => {
    phoneRef.current?.hangup(callId);
  }, []);

  const hold = useCallback((callId: string) => {
    phoneRef.current?.hold(callId);
  }, []);

  const unhold = useCallback((callId: string) => {
    phoneRef.current?.unhold(callId);
  }, []);

  const mute = useCallback((callId: string) => {
    phoneRef.current?.mute(callId);
  }, []);

  const unmute = useCallback((callId: string) => {
    phoneRef.current?.unmute(callId);
  }, []);

  const dtmf = useCallback((callId: string, digit: string) => {
    phoneRef.current?.dtmf(callId, digit);
  }, []);

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
