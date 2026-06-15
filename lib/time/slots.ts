/**
 * Timeline math — converts between minutes-of-day, ISO timestamps, and pixels.
 *
 * Convention: 1 minute = 1 pixel. 24h timeline = 1440px tall.
 * Snap = 15 minutes.
 */

import { getHHMMInTZ, localDateTimeToUTC } from "./tz";

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

/**
 * Build an ISO timestamp from a local date + minutes-of-day **in the
 * browser/server timezone**. Use only when caller is OK with that
 * (anonymous local time, demo data). For user-data writes prefer
 * `minutesToISOInTZ(ymd, minutes, tz)`.
 */
export function localDayMinutesToISO(date: Date, minutes: number): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d.toISOString();
}

/**
 * Extract minutes-of-day in the **browser/server timezone** from an ISO
 * string. Use only when caller is OK with that. For TZ-correct reads,
 * use `isoToMinutesInTZ(iso, tz)`.
 */
export function isoToLocalDayMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * TZ-aware: minutes-of-day for `iso` interpreted in `tz`. Wraps
 * `getHHMMInTZ`. Use this everywhere user-facing time math runs.
 */
export function isoToMinutesInTZ(iso: string, tz: string): number {
  return timeStringToMin(getHHMMInTZ(new Date(iso), tz));
}

/**
 * TZ-aware: build a UTC ISO timestamp from `ymd` + minutes-of-day,
 * interpreting the local time in `tz`. Wraps `localDateTimeToUTC`.
 */
export function minutesToISOInTZ(
  ymd: string,
  minutes: number,
  tz: string,
): string {
  return localDateTimeToUTC(ymd, formatTime(minutes), tz).toISOString();
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

export type CascadeBlock = { id: number; startMin: number; endMin: number };

/**
 * Sunsama-style push for drag-to-reschedule, symmetric in both directions.
 *
 * The dragged block goes to [newStart, newEnd]. Blocks at/below its ORIGINAL
 * start are walked top→bottom and pushed DOWN by exactly the overlap; blocks
 * strictly above are walked bottom→top and pushed UP. Either way gaps absorb
 * the push (a block with room never moves) and durations are preserved. A
 * single drag only ever pushes one direction (moving up can't overlap blocks
 * below and vice-versa), so running both passes is safe.
 *
 * Always compute against an ORIGINAL snapshot of the blocks (not a frame a
 * previous drag tick already shifted), or the push compounds.
 *
 * Returns the changed blocks (dragged first), or null if the chain would run
 * past either end of the day — the caller should then reject that drag frame.
 */
export function computeCascade(
  draggedId: number,
  newStart: number,
  newEnd: number,
  blocks: CascadeBlock[],
): CascadeBlock[] | null {
  const dragged = blocks.find((b) => b.id === draggedId);
  if (!dragged) return null;
  if (newEnd > DAY_MINUTES || newStart < 0) return null;

  const changed: CascadeBlock[] = [
    { id: draggedId, startMin: newStart, endMin: newEnd },
  ];

  // Down-push: blocks at/below the dragged block's original start.
  const below = blocks
    .filter((b) => b.id !== draggedId && b.startMin >= dragged.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  let frontierDown = newEnd;
  for (const b of below) {
    if (b.startMin < frontierDown) {
      const dur = b.endMin - b.startMin;
      const start = frontierDown;
      const end = start + dur;
      if (end > DAY_MINUTES) return null; // chain doesn't fit the day
      changed.push({ id: b.id, startMin: start, endMin: end });
      frontierDown = end;
    } else {
      frontierDown = b.endMin; // gap absorbed the push; block stays put
    }
  }

  // Up-push: blocks strictly above, nearest first (descending start).
  const above = blocks
    .filter((b) => b.id !== draggedId && b.startMin < dragged.startMin)
    .sort((a, b) => b.startMin - a.startMin);
  let frontierUp = newStart;
  for (const b of above) {
    if (b.endMin > frontierUp) {
      const dur = b.endMin - b.startMin;
      const end = frontierUp;
      const start = end - dur;
      if (start < 0) return null; // chain doesn't fit before midnight
      changed.push({ id: b.id, startMin: start, endMin: end });
      frontierUp = start;
    } else {
      frontierUp = b.startMin; // gap absorbed the push; block stays put
    }
  }

  return changed;
}
