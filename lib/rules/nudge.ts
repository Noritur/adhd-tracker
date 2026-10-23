/**
 * Proactive-coaching pattern detection for the block-tick cron.
 *
 * Lives outside `app/api/block-tick/route.ts` because a route file may only
 * export HTTP handlers and route config, so the rule could not be tested
 * there.
 */

import type { NudgeKind } from "@/lib/ai/coach-nudge";
import type { TickBlock } from "@/lib/db/blocks";
import { isFocus } from "@/lib/rules/focus-limits";

const FOCUS_GAP_MS = 15 * 60_000;

/** Detect a proactive-coaching pattern among today's completed blocks. */
export function detectNudge(
  blocks: TickBlock[],
  nowMs: number,
): NudgeKind | null {
  const completed = blocks
    .filter((b) => new Date(b.end_at).getTime() <= nowMs)
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

  // Priority 1: two most recent rated blocks both "swamp".
  const rated = completed.filter((b) => b.mood !== null);
  if (
    rated.length >= 2 &&
    rated[rated.length - 1].mood === "swamp" &&
    rated[rated.length - 2].mood === "swamp"
  ) {
    return "swamp_streak";
  }

  // Priority 2: two focus blocks back-to-back with <15min non-focus gap.
  let prevFocusEnd: number | null = null;
  for (const b of completed) {
    if (isFocus(b.category)) {
      const startMs = new Date(b.start_at).getTime();
      if (prevFocusEnd !== null && startMs - prevFocusEnd < FOCUS_GAP_MS) {
        return "focus_no_break";
      }
      prevFocusEnd = new Date(b.end_at).getTime();
    } else {
      prevFocusEnd = null; // a real break happened
    }
  }

  return null;
}
