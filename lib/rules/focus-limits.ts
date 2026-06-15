/**
 * Anti-burnout rules for focus work.
 *
 * - A single focus block (coded / work_other) may not exceed 50 minutes.
 *
 * The 15-min spacing rule between focus blocks was dropped 2026-06-14 (felt
 * too restrictive in manual use). Kept the constant + tests reference it; the
 * cap is the only enforced rule now.
 *
 * Shared by manual create/edit, drag-resize, and the morning planner so
 * the rule can't be bypassed through any path.
 */

import type { Category } from "@/lib/categories";

export const FOCUS_CATEGORIES: Category[] = ["coded", "work_other"];
export const MAX_FOCUS_MIN = 50;

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

/** Validate a focus block against the 50-min cap. */
export function validateFocusBlock(
  candidate: FocusCheckBlock,
): FocusCheckResult {
  if (!isFocus(candidate.category)) return { ok: true };

  const durationMin = (candidate.endMs - candidate.startMs) / MIN;
  if (durationMin > MAX_FOCUS_MIN) {
    return {
      ok: false,
      error: `макс ${MAX_FOCUS_MIN}хв фокусу — розбий на коротші блоки`,
    };
  }

  return { ok: true };
}
