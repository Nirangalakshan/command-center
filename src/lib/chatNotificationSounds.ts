const MUTE_KEY = 'command-centre:chat-sounds-muted';

let lastChimeAt = 0;
const CHIME_GAP_MS = 450;

function allowChime(): boolean {
  const now = Date.now();
  if (now - lastChimeAt < CHIME_GAP_MS) return false;
  lastChimeAt = now;
  return true;
}

export function isChatSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setChatSoundMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* ignore */
  }
}

function resumeAudioContext(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    return ctx.resume().catch(() => undefined);
  }
  return Promise.resolve();
}

/** Short pleasant chime — new conversation in inbox. */
export async function playNewChatChime(): Promise<void> {
  if (isChatSoundMuted()) return;
  if (!allowChime()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    await resumeAudioContext(ctx);
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.12, now);
    master.connect(ctx.destination);

    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    };

    playTone(523.25, now, 0.12);
    playTone(659.25, now + 0.1, 0.14);
    playTone(783.99, now + 0.22, 0.18);

    const closeAt = now + 0.55;
    setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, closeAt * 1000);
  } catch {
    /* ignore */
  }
}

/** Softer ping — new customer message. */
export async function playNewMessageChime(): Promise<void> {
  if (isChatSoundMuted()) return;
  if (!allowChime()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    await resumeAudioContext(ctx);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.1, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
    setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, 350);
  } catch {
    /* ignore */
  }
}
