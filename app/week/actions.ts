"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setWeekWord } from "@/lib/db/week-words";

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
