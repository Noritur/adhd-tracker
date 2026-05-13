/**
 * Timeline math — converts between minutes-of-day, ISO timestamps, and pixels.
 *
 * Convention: 1 minute = 1 pixel. 24h timeline = 1440px tall.
 * Snap = 15 minutes.
 */

export const PX_PER_MIN = 1;
export const SNAP_MIN = 15;
export const DAY_MINUTES = 24 * 60;
export const MIN_BLOCK_MIN = 15;

export function minToPx(min: number): number {
  return min * PX_PER_MIN;
}

export function pxToMin(px: number): number {
  return Math.round(px / PX_PER_MIN);
}

export function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

export function clampMin(min: number): number {
  return Math.max(0, Math.min(DAY_MINUTES, min));
}

/** Build an ISO timestamp from a local date + minutes-of-day. */
export function localDayMinutesToISO(date: Date, minutes: number): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d.toISOString();
}

/** Extract minutes-of-day in the browser's local timezone from an ISO string. */
export function isoToLocalDayMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Format minutes-of-day as H:MM. */
export function formatTime(minutes: number): string {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

/** Format duration as "Hг MMхв" — for summary tiles later. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}хв`;
  if (m === 0) return `${h}г`;
  return `${h}г ${m}хв`;
}

/** Convert "HH:MM" string from a time input back to minutes-of-day. */
export function timeStringToMin(str: string): number {
  const [h, m] = str.split(":").map((s) => Number.parseInt(s, 10));
  return (h || 0) * 60 + (m || 0);
}
