/**
 * Anti-burnout rules for focus work.
 *
 * - A single focus block (coded / work_other) may not exceed 50 minutes.
 * - Two focus blocks must be separated by at least 15 minutes of
 *   non-focus time (rest, walk, chores — anything but focus).
 *
 * Shared by manual create/edit, drag-resize, and the morning planner so
 * the rule can't be bypassed through any path.
 */

import type { Category } from "@/lib/categories";

export const FOCUS_CATEGORIES: Category[] = ["coded", "work_other"];
export const MAX_FOCUS_MIN = 50;
export const MIN_FOCUS_GAP_MIN = 15;

const MIN = 60_000;

export function isFocus(category: Category): boolean {
  return FOCUS_CATEGORIES.includes(category);
}

export type FocusCheckBlock = {
  category: Category;
  startMs: number;
  endMs: number;
};

export type FocusCheckResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a focus block against the 50-min cap and the 15-min spacing
 * rule. `others` must already exclude the block being edited and should
 * be same-day blocks.
 */
export function validateFocusBlock(
  candidate: FocusCheckBlock,
  others: FocusCheckBlock[],
): FocusCheckResult {
  if (!isFocus(candidate.category)) return { ok: true };

  const durationMin = (candidate.endMs - candidate.startMs) / MIN;
  if (durationMin > MAX_FOCUS_MIN) {
    return {
      ok: false,
      error: `макс ${MAX_FOCUS_MIN}хв фокусу — розбий і встав ${MIN_FOCUS_GAP_MIN}хв паузу`,
    };
  }

  for (const other of others) {
    if (!isFocus(other.category)) continue;

    // Overlap is a different rule (DB exclusion constraint) — skip here.
    const overlaps =
      candidate.startMs < other.endMs && other.startMs < candidate.endMs;
    if (overlaps) continue;

    const gapMs =
      candidate.endMs <= other.startMs
        ? other.startMs - candidate.endMs
        : candidate.startMs - other.endMs;

    if (gapMs < MIN_FOCUS_GAP_MIN * MIN) {
      return {
        ok: false,
        error: `між фокус-блоками треба мін ${MIN_FOCUS_GAP_MIN}хв паузу`,
      };
    }
  }

  return { ok: true };
}
