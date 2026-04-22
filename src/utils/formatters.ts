/* ═══════════════════════════════════════════════════
   Formatting helpers for telephony data
   ═══════════════════════════════════════════════════ */

const pad = (n: number) => String(n).padStart(2, '0');

/** Format milliseconds into H:MM:SS or M:SS */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Format seconds into H:MM:SS or M:SS */
export function formatSeconds(sec: number): string {
  return sec > 0 ? formatDuration(sec * 1000) : '—';
}

/** Format ISO date or Date to HH:MM:SS (Melbourne time) */
export function formatTime(date: string | Date | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Australia/Melbourne',
  });
}

/** Format Australian phone numbers: 0412 345 678 */
export function formatPhone(num: string | null): string {
  if (!num) return '—';
  const clean = String(num).replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return num;
}

/**
 * Returns true if the caller number looks like a real external phone number.
 *
 * Accepted patterns:
 *   +94…   Sri Lanka international (E.164)
 *   +61…   Australia international (E.164)
 *   94…    Sri Lanka without leading +
 *   61…    Australia without leading +
 *   0…     Local number (Sri Lanka 0xx / Australian 0x)
 *
 * Rejected: internal extensions (≤ 6 digits), empty, or unrecognised prefixes.
 */
export function isValidCallerNumber(num: string | null | undefined): boolean {
  if (!num) return false;
  const raw = String(num).trim();
  if (!raw) return false;

  // Allow international formats: +94, +61
  if (/^\+94\d{7,}$/.test(raw)) return true;
  if (/^\+61\d{7,}$/.test(raw)) return true;

  // Allow without leading +: 94…, 61…
  if (/^94\d{7,}$/.test(raw)) return true;
  if (/^61\d{7,}$/.test(raw)) return true;

  // Allow local numbers starting with 0 (min 7 digits after the 0)
  if (/^0\d{7,}$/.test(raw)) return true;

  return false;
}
