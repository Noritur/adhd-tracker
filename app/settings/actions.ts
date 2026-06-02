"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { upsertProfile, type AiTone, type ProfilePatch } from "@/lib/db/profile";

export type UpdateProfileState = { ok: boolean; error?: string };

function isValidHHMM(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

export async function updateProfileAction(
  _prev: UpdateProfileState | null,
  formData: FormData,
): Promise<UpdateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const timezone = String(formData.get("timezone") ?? "").trim();
  const work_hours_start = String(formData.get("work_hours_start") ?? "").trim();
  const work_hours_end = String(formData.get("work_hours_end") ?? "").trim();
  const toneRaw = String(formData.get("ai_tone") ?? "gentle");
  const evening_review_at = String(
    formData.get("evening_review_at") ?? "",
  ).trim();
  const evening_review_enabled =
    String(formData.get("evening_review_enabled") ?? "0") === "1";
  const restDaysRaw = String(formData.get("rest_days") ?? "").trim();

  if (!timezone) return { ok: false, error: "вкажи часовий пояс" };
  if (!isValidHHMM(work_hours_start) || !isValidHHMM(work_hours_end)) {
    return { ok: false, error: "робочі години у форматі HH:MM" };
  }
  if (!isValidHHMM(evening_review_at)) {
    return { ok: false, error: "час ревью у форматі HH:MM" };
  }
  if (toneRaw !== "firm" && toneRaw !== "gentle") {
    return { ok: false, error: "тон має бути firm або gentle" };
  }
  const ai_tone: AiTone = toneRaw;

  // Parse rest_days: "0,6" → [0, 6]. Filter to valid weekday indices.
  const rest_days = restDaysRaw
    ? restDaysRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];

  const patch: ProfilePatch = {
    timezone,
    work_hours_start: `${work_hours_start}:00`,
    work_hours_end: `${work_hours_end}:00`,
    ai_tone,
    evening_review_at: `${evening_review_at}:00`,
    evening_review_enabled,
    rest_days,
  };

  try {
    await upsertProfile(supabase, user.id, patch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save failed";
    console.error(
      JSON.stringify({ level: "error", msg: "settings.save_failed", error: msg }),
    );
    return { ok: false, error: msg };
  }

  revalidatePath("/settings");
  revalidatePath("/today");
  revalidatePath("/week");
  return { ok: true };
}
