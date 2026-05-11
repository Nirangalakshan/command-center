/** Australia/Melbourne — used for navbar clock, attendance day boundaries, and shift times. */

export const AU_DASHBOARD_TIMEZONE = "Australia/Melbourne";

const auYmdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: AU_DASHBOARD_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date yyyy-MM-dd in Melbourne for this instant (UTC ms). */
export function getAustralianDateKey(ms: number): string {
  return auYmdFormatter.format(new Date(ms));
}

export function zonedYmdUtc(ms: number): string {
  return auYmdFormatter.format(new Date(ms));
}

/** First UTC millisecond where Melbourne's calendar date is `ymd` (yyyy-MM-dd). */
export function startOfAustralianDayMs(ymd: string): number {
  const [Y, M, D] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(Y) || !Number.isFinite(M) || !Number.isFinite(D)) {
    throw new Error(`Invalid date key: ${ymd}`);
  }
  let lo = Date.UTC(Y, M - 1, D, 0, 0, 0, 0) - 72 * 3600000;
  let hi = Date.UTC(Y, M - 1, D, 0, 0, 0, 0) + 72 * 3600000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (zonedYmdUtc(mid) < ymd) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function nextAustralianYmd(ymd: string): string {
  const start = startOfAustralianDayMs(ymd);
  let t = start;
  while (zonedYmdUtc(t) === ymd) {
    t += 60000;
  }
  return zonedYmdUtc(t);
}

function prevAustralianYmd(ymd: string): string {
  return zonedYmdUtc(startOfAustralianDayMs(ymd) - 1);
}

export function addAustralianCalendarDays(ymd: string, delta: number): string {
  if (delta === 0) return ymd;
  let cur = ymd;
  const step = delta > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(delta); i++) {
    cur = step > 0 ? nextAustralianYmd(cur) : prevAustralianYmd(cur);
  }
  return cur;
}

/** Last UTC ms still on Melbourne calendar date `ymd`. */
export function endOfAustralianDayMs(ymd: string): number {
  return startOfAustralianDayMs(nextAustralianYmd(ymd)) - 1;
}

export function attendanceDayRangeAustralianYmd(ymd: string): { startIso: string; endIso: string } {
  const startMs = startOfAustralianDayMs(ymd);
  const endMs = endOfAustralianDayMs(ymd);
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

/** e.g. "5 May" for headings inside a selected Melbourne day. */
export function formatAustralianDayShort(ymd: string): string {
  const ms = startOfAustralianDayMs(ymd) + 12 * 3600000;
  return new Date(ms).toLocaleDateString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    day: "numeric",
    month: "short",
  });
}

/** e.g. "Thu 5 May 2026" for a Melbourne calendar day. */
export function formatAustralianDayHeading(ymd: string): string {
  const ms = startOfAustralianDayMs(ymd) + 12 * 3600000;
  return new Date(ms).toLocaleDateString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** HH:mm:ss in Melbourne (24h). */
export function formatTimeAu(isoOrMs: string | Date | number | null): string {
  if (isoOrMs === null || isoOrMs === undefined) return "—";
  const d =
    typeof isoOrMs === "number"
      ? new Date(isoOrMs)
      : isoOrMs instanceof Date
        ? isoOrMs
        : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** HH:mm in Melbourne (24h). */
export function formatTimeAuShort(isoOrMs: string | Date | number | null): string {
  if (isoOrMs === null || isoOrMs === undefined) return "—";
  const d =
    typeof isoOrMs === "number"
      ? new Date(isoOrMs)
      : isoOrMs instanceof Date
        ? isoOrMs
        : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatAustralianNavDate(isoMs: Date): string {
  return isoMs.toLocaleDateString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatAustralianNavTime(isoMs: Date): string {
  return isoMs.toLocaleTimeString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

/** d MMM yyyy, HH:mm in Melbourne. */
export function formatDateTimeAu(isoOrMs: string | Date | number | null): string {
  if (isoOrMs === null || isoOrMs === undefined) return "—";
  const d =
    typeof isoOrMs === "number"
      ? new Date(isoOrMs)
      : isoOrMs instanceof Date
        ? isoOrMs
        : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    timeZone: AU_DASHBOARD_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
