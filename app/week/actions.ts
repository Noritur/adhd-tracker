"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setWeekWord } from "@/lib/db/week-words";
import { getProfile } from "@/lib/db/profile";
import {
  getWeekSummary,
  getWeekSummariesForRange,
  setWeekReflection,
} from "@/lib/db/week-summaries";
import { generateWeekAdvice } from "@/lib/ai/week-advice";

export type SetWeekWordState = {
  ok: boolean;
  error?: string;
};

export async function setWeekWordAction(
  _prev: SetWeekWordState | null,
  formData: FormData,
): Promise<SetWeekWordState> {
  const word = String(formData.get("word") ?? "").trim();
  const weekStart = String(formData.get("week_start") ?? "").trim();

  if (!word) return { ok: false, error: "напиши слово" };
  if (word.length > 100) return { ok: false, error: "до 100 символів" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return { ok: false, error: "invalid week_start" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  try {
    await setWeekWord(supabase, user.id, weekStart, word);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "week.set_word_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return { ok: false, error: "не зберіг" };
  }

  revalidatePath("/week");
  return { ok: true };
}

export type WeekReflectionState = {
  ok: boolean;
  error?: string;
};

export async function submitWeekReflectionAction(
  _prev: WeekReflectionState | null,
  formData: FormData,
): Promise<WeekReflectionState> {
  const userNote = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 2000);
  const weekStart = String(formData.get("week_start") ?? "").trim();

  if (!userNote) return { ok: false, error: "напиши пару слів про тиждень" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return { ok: false, error: "invalid week_start" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  try {
    const summary = await getWeekSummary(supabase, user.id, weekStart);
    if (!summary) {
      return { ok: false, error: "ще нема думок коуча за цей тиждень" };
    }
    const profile = await getProfile(supabase, user.id);
    const pastWeeks = await getWeekSummariesForRange(
      supabase,
      user.id,
      weekStart,
      8,
    );
    const result = await generateWeekAdvice({
      profile,
      weekSummary: summary.summary,
      userNote,
      pastWeeks,
    });
    if (!result) {
      return { ok: false, error: "коуч не відповів, спробуй ще" };
    }
    await setWeekReflection(
      supabase,
      user.id,
      weekStart,
      userNote,
      result.advice,
      result,
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "week.reflection_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return { ok: false, error: "не зберіг" };
  }

  revalidatePath("/week");
  return { ok: true };
}
