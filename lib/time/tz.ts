/**
 * Timezone-aware date math.
 *
 * We store every block as a UTC timestamp (`start_at timestamptz`). But the
 * user thinks in "their" local time. So when we query "blocks for today",
 * we need [00:00 in user-tz, next 00:00) converted back to UTC.
 *
 * Implementation uses Intl.DateTimeFormat exclusively — no extra deps.
 */

export const DEFAULT_TIMEZONE = "Europe/Madrid";

/** UTC offset of `tz` at instant `at`, in minutes. CEST → +120, EST → -300. */
export function getTZOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second),
  );
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** YYYY-MM-DD as it appears in `tz` at instant `at`. */
export function getYMDInTZ(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/** HH:MM (24h) as it appears in `tz` at instant `at`. */
export function getHHMMInTZ(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const h = map.hour === "24" ? "00" : map.hour;
  return `${h}:${map.minute}`;
}

const DAY_MS = 86_400_000;

/**
 * UTC instant of the wall-clock time y-m-d hh:mm in `tz`. Day and hour may
 * overflow (d + 1 past month end, 24:00): Date.UTC rolls them over.
 *
 * The offset can change during the day, so the offsets a day before and a
 * day after are both tried, and the one that reads back as the same wall
 * time wins. Taking the offset at the wall time read as UTC is an hour off
 * near a switch (T22). Two wall times have no single answer. One that
 * happens twice on fall-back is taken the first time. One skipped by
 * spring-forward lands on the first instant after the gap (02:30 → 03:00):
 * shifting it by the gap instead (JS Date's rule, 02:30 → 03:30) would put
 * 02:45 after 03:00, and a block across the gap would end before it starts.
 */
function wallTimeToUTC(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  tz: string,
): Date {
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  const before = getTZOffsetMinutes(new Date(wall - DAY_MS), tz);
  const after = getTZOffsetMinutes(new Date(wall + DAY_MS), tz);
  const early = wall - before * 60_000;
  if (getTZOffsetMinutes(new Date(early), tz) === before) return new Date(early);
  const late = wall - after * 60_000;
  if (getTZOffsetMinutes(new Date(late), tz) === after) return new Date(late);
  // Skipped wall time: the switch lies in (late, early]. Find its minute.
  let lo = late; // still on `before`
  let hi = early; // already on `after`
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
    if (getTZOffsetMinutes(new Date(mid), tz) === after) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

/** Local Y-M-D of instant `at` in `tz`, as numbers. */
function ymdPartsInTZ(at: Date, tz: string): [number, number, number] {
  const [y, m, d] = getYMDInTZ(at, tz).split("-").map(Number);
  return [y, m, d];
}

/** UTC instant of local-midnight in `tz` for the local day containing `localDate`. */
export function localMidnightUTC(localDate: Date, tz: string): Date {
  const [y, m, d] = ymdPartsInTZ(localDate, tz);
  return wallTimeToUTC(y, m, d, 0, 0, tz);
}

/**
 * UTC bounds of the local day containing `localDate` in `tz`.
 *
 * The next day is counted on the calendar (d + 1), not as a UTC-midnight
 * Date: in a UTC-negative zone UTC midnight is still the previous local
 * day, which made the day zero hours long (T24).
 */
export function localDayBoundsUTC(
  localDate: Date,
  tz: string,
): { start: Date; end: Date } {
  const [y, m, d] = ymdPartsInTZ(localDate, tz);
  return {
    start: wallTimeToUTC(y, m, d, 0, 0, tz),
    end: wallTimeToUTC(y, m, d + 1, 0, 0, tz),
  };
}

/** Local Y-M-D of the Monday starting the local week of `localDate`. */
function mondayPartsInTZ(localDate: Date, tz: string): [number, number, number] {
  const [y, m, d] = ymdPartsInTZ(localDate, tz);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return [y, m, d + mondayOffset];
}

/** UTC instant of Monday-00:00 in `tz` for the local week containing `localDate`. */
export function localMondayMidnightUTC(localDate: Date, tz: string): Date {
  const [y, m, d] = mondayPartsInTZ(localDate, tz);
  return wallTimeToUTC(y, m, d, 0, 0, tz);
}

/** UTC bounds of the Mon→next-Mon local week containing `localDate` in `tz`. */
export function localWeekBoundsUTC(
  localDate: Date,
  tz: string,
): { start: Date; end: Date } {
  const [y, m, d] = mondayPartsInTZ(localDate, tz);
  return {
    start: wallTimeToUTC(y, m, d, 0, 0, tz),
    end: wallTimeToUTC(y, m, d + 7, 0, 0, tz),
  };
}

/** 0=Sun..6=Sat for the local day of `at` in `tz`. */
export function getWeekdayInTZ(at: Date, tz: string): number {
  const ymd = getYMDInTZ(at, tz);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Build a UTC timestamp for "local YYYY-MM-DD HH:MM in tz".
 * Used by morning planner when AI returns "10:30" → needs absolute timestamp.
 */
export function localDateTimeToUTC(
  ymd: string, // "YYYY-MM-DD"
  hhmm: string, // "HH:MM"
  tz: string,
): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return wallTimeToUTC(y, m, d, hh, mm, tz);
}

/**
 * Strict YMD format + calendar validity check.
 * Rejects bad format, out-of-range month/day, AND date roll-overs like
 * "2026-02-31" (which `new Date(Date.UTC(...))` would silently normalize
 * to March 3).
 */
export function isValidYMD(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Round-trip check rejects 2026-02-31 etc.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Parse YMD + tz into a UTC instant guaranteed to land INSIDE that local
 * day in tz. Uses noon-local as the probe (12:00) so even ±14h offsets
 * stay safely within the calendar day. Returns null on invalid/normalized
 * YMD.
 *
 * Centralized so every route that maps a YMD path/search param into a
 * Date — `/week?week=`, `/day/[date]`, retro-fill action — agrees on
 * which calendar day the user meant. Without this, a route handler in
 * the Madrid build that does `new Date(Date.UTC(y,m-1,d))` lands at
 * UTC midnight, which is the PREVIOUS local day in America/New_York,
 * Los_Angeles, Chicago, Mexico_City, Sao_Paulo — every negative-offset
 * timezone the settings form actually exposes.
 */
export function ymdToProbeUTC(ymd: string, tz: string): Date | null {
  if (!isValidYMD(ymd)) return null;
  return localDateTimeToUTC(ymd, "12:00", tz);
}
