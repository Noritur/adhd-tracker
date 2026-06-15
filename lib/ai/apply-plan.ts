/**
 * Shared "apply an AI plan to a day" logic.
 *
 * Both `generatePlanAction` (add blocks alongside existing ones) and
 * `rebuildDayAction` (after wiping future blocks, generate fresh) used
 * to inline ~80 LOC of slot-fitting + focus-rule enforcement + insert
 * loop. Extracted here so any future change to the policy (gap sizes,
 * trim vs drop, error mapping) lands in one place.
 *
 * Retro-fill has a different insert shape (no past-blocks navigation,
 * just sequential overlap-checked inserts) and stays separate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Block } from "@/lib/db/blocks";
import { createBlock } from "@/lib/db/blocks";
import type { Category } from "@/lib/categories";
import {
  MIN_BLOCK_MIN,
  formatTime,
  timeStringToMin,
} from "@/lib/time/slots";
import {
  getHHMMInTZ,
  localDateTimeToUTC,
} from "@/lib/time/tz";
import { MAX_FOCUS_MIN, isFocus } from "@/lib/rules/focus-limits";
import type { Plan } from "./planner";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

/**
 * Largest free slot inside `[aiStart, aiEnd)` given `busy` intervals
 * (all in minutes-of-day). Used to clip the AI's intended window down
 * to fit between existing blocks. Returns null if no gap >= `minLen`.
 */
export function findLargestFreeSlot(
  aiStart: number,
  aiEnd: number,
  busy: { start: number; end: number }[],
  minLen: number,
): { start: number; end: number } | null {
  const clipped = busy
    .map((b) => ({
      start: Math.max(b.start, aiStart),
      end: Math.min(b.end, aiEnd),
    }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  let bestStart = 0;
  let bestEnd = 0;
  let bestLen = 0;
  let cursor = aiStart;

  for (const b of clipped) {
    if (b.start > cursor) {
      const len = b.start - cursor;
      if (len > bestLen) {
        bestLen = len;
        bestStart = cursor;
        bestEnd = b.start;
      }
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < aiEnd) {
    const len = aiEnd - cursor;
    if (len > bestLen) {
      bestLen = len;
      bestStart = cursor;
      bestEnd = aiEnd;
    }
  }

  if (bestLen < minLen) return null;
  return { start: bestStart, end: bestEnd };
}

export type ApplyPlanResult = { created: number; skipped: number };

export type ApplyPlanOpts = {
  supabase: DbClient;
  userId: string;
  ymd: string;
  tz: string;
  /**
   * Existing blocks that act as the "busy" set the AI plan must fit
   * around. For the planner this is the full day; for rebuild this is
   * just the past (completed) blocks.
   */
  seedBlocks: Block[];
  plan: Plan;
  /** Log key for insert failures, e.g. "today.plan" or "today.rebuild". */
  logKey?: string;
};

/**
 * Apply each plan block in chronological order:
 * - Clip to the largest free slot inside its requested window.
 * - Trim focus blocks to MAX_FOCUS_MIN (50 by default).
 * - Drop focus blocks that violate the 15-min gap rule (can't be fixed locally).
 * - Insert via createBlock; DB exclusion constraint catches any remaining
 *   overlap and bumps the skipped counter.
 */
export async function applyPlanBlocks({
  supabase,
  userId,
  ymd,
  tz,
  seedBlocks,
  plan,
  logKey = "today.plan",
}: ApplyPlanOpts): Promise<ApplyPlanResult> {
  // Seed busy intervals from existing blocks (minutes-of-day).
  const busy: { start: number; end: number; category: Category }[] =
    seedBlocks.map((b) => ({
      start: timeStringToMin(getHHMMInTZ(new Date(b.start_at), tz)),
      end: timeStringToMin(getHHMMInTZ(new Date(b.end_at), tz)),
      category: b.category,
    }));

  let created = 0;
  let skipped = 0;

  // Sort AI blocks by start so insertion order is deterministic.
  const sorted = [...plan.blocks].sort(
    (a, b) => timeStringToMin(a.start) - timeStringToMin(b.start),
  );

  for (const blk of sorted) {
    const aiStart = timeStringToMin(blk.start);
    const aiEnd = timeStringToMin(blk.end);
    if (aiEnd <= aiStart) {
      skipped++;
      continue;
    }

    const slot = findLargestFreeSlot(aiStart, aiEnd, busy, MIN_BLOCK_MIN);
    if (!slot) {
      skipped++;
      continue;
    }

    const cat = blk.category as Category;
    const sMin = slot.start;
    let eMin = slot.end;

    // Trim focus to 50 min (planner pattern — never silently drop).
    if (isFocus(cat) && eMin - sMin > MAX_FOCUS_MIN) {
      eMin = sMin + MAX_FOCUS_MIN;
    }

    const startISO = localDateTimeToUTC(ymd, formatTime(sMin), tz).toISOString();
    const endISO = localDateTimeToUTC(ymd, formatTime(eMin), tz).toISOString();

    try {
      await createBlock(supabase, {
        user_id: userId,
        start_at: startISO,
        end_at: endISO,
        category: cat,
        label: blk.label,
      });
      busy.push({ start: sMin, end: eMin, category: cat });
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("time_blocks_no_overlap")) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: `${logKey}.insert_failed`,
            error: msg,
          }),
        );
      }
      skipped++;
    }
  }

  return { created, skipped };
}
