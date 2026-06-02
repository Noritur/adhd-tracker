"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBlock, getBlocksForDate } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { generateRetroFill } from "@/lib/ai/retro-fill";
import { invalidateInsightsCache } from "@/lib/ai/cache";
import { getYMDInTZ, localDateTimeToUTC } from "@/lib/time/tz";
import { timeStringToMin, formatTime, MIN_BLOCK_MIN } from "@/lib/time/slots";
import {
  isFocus,
  MAX_FOCUS_MIN,
  validateFocusBlock,
  type FocusCheckBlock,
} from "@/lib/rules/focus-limits";
import type { Category } from "@/lib/categories";

export type RetroFillState = {
  ok: boolean;
  created?: number;
  skipped?: number;
  note?: string | null;
  error?: string;
};

export async function retroFillAction(
  _prev: RetroFillState | null,
  formData: FormData,
): Promise<RetroFillState> {
  const userText = String(formData.get("text") ?? "").trim();
  const ymd = String(formData.get("ymd") ?? "").trim();

  if (!userText) return { ok: false, error: "опиши як пройшов день" };
  if (userText.length > 2000) {
    return { ok: false, error: "коротше будь ласка (макс 2000 символів)" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { ok: false, error: "invalid date" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);

  // Reject today/future in user's local timezone. YMD strings compare
  // lexicographically as ISO dates, so direct >= works.
  // Previous version used setUTCHours(0,0,0,0) which mis-classifies
  // late-night Madrid blocks etc. around UTC midnight.
  const todayYMD = getYMDInTZ(new Date(), tz);
  if (ymd >= todayYMD) {
    return { ok: false, error: "retro-fill тільки для минулих днів" };
  }

  // Build target Date for getBlocksForDate (any UTC instant inside the
  // local day works; localDayBoundsUTC inside the helper normalizes).
  const [y, m, d] = ymd.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));

  // Check if day already has blocks.
  const existing = await getBlocksForDate(supabase, user.id, targetDate, tz);
  if (existing.length > 0) {
    return {
      ok: false,
      error: `цей день вже має ${existing.length} блоків. видали їх спочатку якщо хочеш переписати`,
    };
  }

  const result = await generateRetroFill(userText, ymd, tz, profile);
  if (!result) {
    return { ok: false, error: "AI не зміг реконструювати день, спробуй ще" };
  }

  // Insert blocks with overlap/focus safety.
  // `busy` keeps minute-of-day intervals for fast overlap pre-check;
  // `occupiedFocus` mirrors them as FocusCheckBlock for the shared validator.
  const busy: { start: number; end: number; category: Category }[] = [];
  const occupiedFocus: FocusCheckBlock[] = [];
  let created = 0;
  let skipped = 0;

  const sorted = [...result.blocks].sort(
    (a, b) => timeStringToMin(a.start) - timeStringToMin(b.start),
  );

  for (const blk of sorted) {
    const aiStart = timeStringToMin(blk.start);
    const aiEnd = timeStringToMin(blk.end);
    if (aiEnd <= aiStart || aiEnd - aiStart < MIN_BLOCK_MIN) {
      skipped++;
      continue;
    }

    // Check overlap with already inserted blocks (pre-DB short-circuit).
    const overlaps = busy.some(
      (b) => aiStart < b.end && b.start < aiEnd,
    );
    if (overlaps) {
      skipped++;
      continue;
    }

    const cat = blk.category as Category;
    let eMin = aiEnd;

    // Cap focus at 50 min — trim, don't drop (same pattern as planner).
    if (isFocus(cat) && eMin - aiStart > MAX_FOCUS_MIN) {
      eMin = aiStart + MAX_FOCUS_MIN;
    }

    const startISO = localDateTimeToUTC(
      ymd,
      formatTime(aiStart),
      tz,
    ).toISOString();
    const endISO = localDateTimeToUTC(
      ymd,
      formatTime(eMin),
      tz,
    ).toISOString();

    // Run shared focus-rule validation: 50-min cap + 15-min spacing rule.
    // Trim already handled duration, but validator catches gap violation
    // against previously inserted focus blocks.
    if (isFocus(cat)) {
      const candidate: FocusCheckBlock = {
        category: cat,
        startMs: new Date(startISO).getTime(),
        endMs: new Date(endISO).getTime(),
      };
      const check = validateFocusBlock(candidate, occupiedFocus);
      if (!check.ok) {
        skipped++;
        continue;
      }
    }

    try {
      await createBlock(supabase, {
        user_id: user.id,
        start_at: startISO,
        end_at: endISO,
        category: cat,
        label: blk.label ?? null,
      });
      busy.push({ start: aiStart, end: eMin, category: cat });
      if (isFocus(cat)) {
        occupiedFocus.push({
          category: cat,
          startMs: new Date(startISO).getTime(),
          endMs: new Date(endISO).getTime(),
        });
      }
      created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("time_blocks_no_overlap")) {
        skipped++;
      } else {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "retro_fill.insert_failed",
            error: msg,
          }),
        );
        skipped++;
      }
    }
  }

  // Retro-fill changes blocks visible in week-scope insights; bust the
  // cache so the next /week view doesn't show pre-fill coaching.
  await invalidateInsightsCache(supabase, user.id);
  revalidatePath(`/day/${ymd}`);
  revalidatePath("/week");
  return { ok: true, created, skipped, note: result.note ?? null };
}
