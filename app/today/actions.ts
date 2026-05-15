"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createBlock,
  updateBlock,
  deleteBlock,
  getBlocksForDate,
} from "@/lib/db/blocks";
import type { Category } from "@/lib/categories";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import {
  getHHMMInTZ,
  getYMDInTZ,
  localDateTimeToUTC,
} from "@/lib/time/tz";
import { MIN_BLOCK_MIN, formatTime, timeStringToMin } from "@/lib/time/slots";
import { generatePlan } from "@/lib/ai/planner";
import type { ExistingBlockLite } from "@/lib/ai/prompts";
import { setReviewResponse, type ReviewResponse } from "@/lib/db/reviews";
import {
  MAX_FOCUS_MIN,
  isFocus,
  validateFocusBlock,
  type FocusCheckBlock,
} from "@/lib/rules/focus-limits";

/** Load same-day blocks as FocusCheckBlock[], excluding one id (for edits). */
async function focusContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  anchorISO: string,
  tz: string,
  excludeId: number | null,
): Promise<FocusCheckBlock[]> {
  const day = await getBlocksForDate(
    supabase,
    userId,
    new Date(anchorISO),
    tz,
  );
  return day
    .filter((b) => b.id !== excludeId)
    .map((b) => ({
      category: b.category,
      startMs: new Date(b.start_at).getTime(),
      endMs: new Date(b.end_at).getTime(),
    }));
}

export type SaveBlockState = { error?: string };

export async function saveBlockAction(
  _prev: SaveBlockState | null,
  formData: FormData,
): Promise<SaveBlockState> {
  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : null;
  const start_at = String(formData.get("start_at") ?? "");
  const end_at = String(formData.get("end_at") ?? "");
  const category = String(formData.get("category") ?? "") as Category;
  const labelRaw = formData.get("label");
  const label = labelRaw ? String(labelRaw).trim() : null;

  if (!start_at || !end_at || !category) {
    return { error: "missing required fields" };
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return { error: "кінець має бути після початку" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  if (isFocus(category)) {
    const profile = await getProfile(supabase, user.id);
    const tz = profileTimezone(profile);
    const others = await focusContext(supabase, user.id, start_at, tz, id);
    const check = validateFocusBlock(
      {
        category,
        startMs: new Date(start_at).getTime(),
        endMs: new Date(end_at).getTime(),
      },
      others,
    );
    if (!check.ok) return { error: check.error };
  }

  try {
    if (id) {
      await updateBlock(supabase, id, {
        start_at,
        end_at,
        category,
        label,
        notified_ending_at: null,
        notified_started_at: null,
      });
    } else {
      await createBlock(supabase, {
        user_id: user.id,
        start_at,
        end_at,
        category,
        label,
      });
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : "save failed";
    console.error(
      JSON.stringify({ level: "error", msg: "today.save_failed", error: raw }),
    );
    const friendly = raw.includes("time_blocks_no_overlap")
      ? "цей час уже зайнятий іншим блоком"
      : raw;
    return { error: friendly };
  }

  revalidatePath("/today");
  return {};
}

export type UpdateBlockTimesResult = { error?: string };

export async function updateBlockTimesAction(
  id: number,
  start_at: string,
  end_at: string,
): Promise<UpdateBlockTimesResult> {
  if (!id) return { error: "missing id" };
  if (new Date(end_at) <= new Date(start_at)) {
    return { error: "кінець має бути після початку" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  {
    const profile = await getProfile(supabase, user.id);
    const tz = profileTimezone(profile);
    const day = await getBlocksForDate(
      supabase,
      user.id,
      new Date(start_at),
      tz,
    );
    const self = day.find((b) => b.id === id);
    if (self && isFocus(self.category)) {
      const others: FocusCheckBlock[] = day
        .filter((b) => b.id !== id)
        .map((b) => ({
          category: b.category,
          startMs: new Date(b.start_at).getTime(),
          endMs: new Date(b.end_at).getTime(),
        }));
      const check = validateFocusBlock(
        {
          category: self.category,
          startMs: new Date(start_at).getTime(),
          endMs: new Date(end_at).getTime(),
        },
        others,
      );
      if (!check.ok) return { error: check.error };
    }
  }

  try {
    await updateBlock(supabase, id, {
      start_at,
      end_at,
      // Block moved → its notify state is stale; clear so reminders re-fire.
      notified_ending_at: null,
      notified_started_at: null,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "update failed";
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.update_times_failed",
        error: raw,
      }),
    );
    const friendly = raw.includes("time_blocks_no_overlap")
      ? "цей час уже зайнятий"
      : raw;
    return { error: friendly };
  }

  revalidatePath("/today");
  return {};
}

export type GeneratePlanState = {
  ok: boolean;
  created?: number;
  skipped?: number;
  note?: string | null;
  error?: string;
};

/** Largest free slot inside [aiStart, aiEnd) given busy intervals (in minutes-of-day). */
function findLargestFreeSlot(
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

export async function generatePlanAction(
  _prev: GeneratePlanState | null,
  formData: FormData,
): Promise<GeneratePlanState> {
  const userText = String(formData.get("text") ?? "").trim();
  if (!userText) return { ok: false, error: "напиши що сьогодні треба" };
  if (userText.length > 2000) {
    return { ok: false, error: "коротше будь ласка (макс 2000 символів)" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const now = new Date();
  const ymd = getYMDInTZ(now, tz);

  const existing = await getBlocksForDate(supabase, user.id, now, tz);
  const existingLite: ExistingBlockLite[] = existing.map((b) => ({
    start: getHHMMInTZ(new Date(b.start_at), tz),
    end: getHHMMInTZ(new Date(b.end_at), tz),
    category: b.category,
    label: b.label,
  }));

  const plan = await generatePlan(userText, profile, existingLite, ymd, tz);
  if (!plan) return { ok: false, error: "AI не зміг скласти план, спробуй ще" };

  const busy: { start: number; end: number; category: Category }[] =
    existing.map((b) => ({
      start: timeStringToMin(getHHMMInTZ(new Date(b.start_at), tz)),
      end: timeStringToMin(getHHMMInTZ(new Date(b.end_at), tz)),
      category: b.category,
    }));

  let created = 0;
  let skipped = 0;

  // Sort AI blocks by start for determinism.
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
    let sMin = slot.start;
    let eMin = slot.end;

    // Cap focus blocks at 50 min (planner trims rather than dropping).
    if (isFocus(cat) && eMin - sMin > MAX_FOCUS_MIN) {
      eMin = sMin + MAX_FOCUS_MIN;
    }

    // Enforce 15-min spacing between focus blocks; skip if too tight.
    if (isFocus(cat)) {
      const tooTight = busy.some((b) => {
        if (!isFocus(b.category)) return false;
        const overlaps = sMin < b.end && b.start < eMin;
        if (overlaps) return false;
        const gap = eMin <= b.start ? b.start - eMin : sMin - b.end;
        return gap < 15;
      });
      if (tooTight) {
        skipped++;
        continue;
      }
    }

    const startISO = localDateTimeToUTC(ymd, formatTime(sMin), tz).toISOString();
    const endISO = localDateTimeToUTC(ymd, formatTime(eMin), tz).toISOString();

    try {
      await createBlock(supabase, {
        user_id: user.id,
        start_at: startISO,
        end_at: endISO,
        category: cat,
        label: blk.label,
      });
      busy.push({ start: sMin, end: eMin, category: cat });
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("time_blocks_no_overlap")) {
        skipped++;
      } else {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "today.plan_insert_failed",
            error: msg,
          }),
        );
        skipped++;
      }
    }
  }

  revalidatePath("/today");
  return { ok: true, created, skipped, note: plan.note ?? null };
}

export async function markReviewAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const response = String(formData.get("response")) as ReviewResponse;
  if (!id) return;
  if (response !== "ok" && response !== "skip" && response !== "not_today") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await setReviewResponse(supabase, id, user.id, response);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.mark_review_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  revalidatePath("/today");
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await deleteBlock(supabase, id);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.delete_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  revalidatePath("/today");
}
