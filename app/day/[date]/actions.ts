"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBlock, getBlocksForDate } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { generateRetroFill } from "@/lib/ai/retro-fill";
import { localDateTimeToUTC } from "@/lib/time/tz";
import { timeStringToMin, formatTime, MIN_BLOCK_MIN } from "@/lib/time/slots";
import { isFocus, MAX_FOCUS_MIN } from "@/lib/rules/focus-limits";
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

  // Don't allow retro-fill for today or future.
  const [y, m, d] = ymd.split("-").map(Number);
  const targetDate = new Date(Date.UTC(y, m - 1, d));
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  if (targetDate >= todayStart) {
    return { ok: false, error: "retro-fill тільки для минулих днів" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);

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
  const busy: { start: number; end: number; category: Category }[] = [];
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

    // Check overlap with already inserted blocks.
    const overlaps = busy.some(
      (b) => aiStart < b.end && b.start < aiEnd,
    );
    if (overlaps) {
      skipped++;
      continue;
    }

    const cat = blk.category as Category;
    let eMin = aiEnd;

    // Cap focus at 50 min.
    if (isFocus(cat) && eMin - aiStart > MAX_FOCUS_MIN) {
      eMin = aiStart + MAX_FOCUS_MIN;
    }

    // 15-min gap between focus blocks.
    if (isFocus(cat)) {
      const tooTight = busy.some((b) => {
        if (!isFocus(b.category)) return false;
        const gap =
          eMin <= b.start ? b.start - eMin : aiStart - b.end;
        return gap >= 0 && gap < 15;
      });
      if (tooTight) {
        skipped++;
        continue;
      }
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

    try {
      await createBlock(supabase, {
        user_id: user.id,
        start_at: startISO,
        end_at: endISO,
        category: cat,
        label: blk.label ?? null,
      });
      busy.push({ start: aiStart, end: eMin, category: cat });
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

  revalidatePath(`/day/${ymd}`);
  revalidatePath("/week");
  return { ok: true, created, skipped, note: result.note ?? null };
}
