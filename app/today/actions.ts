"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createBlock,
  updateBlock,
  deleteBlock,
  deleteFutureBlocksInDay,
  getBlocksForDate,
  type Mood,
} from "@/lib/db/blocks";
import type { Category } from "@/lib/categories";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import {
  getHHMMInTZ,
  getYMDInTZ,
  getWeekdayInTZ,
  localDateTimeToUTC,
  localDayBoundsUTC,
} from "@/lib/time/tz";
import { formatTime, timeStringToMin } from "@/lib/time/slots";
import { generatePlan } from "@/lib/ai/planner";
import { generateReschedule } from "@/lib/ai/reschedule";
import { applyPlanBlocks } from "@/lib/ai/apply-plan";
import type {
  ExistingBlockLite,
  RescheduleMoveItem,
} from "@/lib/ai/prompts";
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
  const weekday = getWeekdayInTZ(now, tz);

  const existing = await getBlocksForDate(supabase, user.id, now, tz);
  const existingLite: ExistingBlockLite[] = existing.map((b) => ({
    start: getHHMMInTZ(new Date(b.start_at), tz),
    end: getHHMMInTZ(new Date(b.end_at), tz),
    category: b.category,
    label: b.label,
  }));

  const plan = await generatePlan(
    userText,
    profile,
    existingLite,
    ymd,
    tz,
    weekday,
  );
  if (!plan) return { ok: false, error: "AI не зміг скласти план, спробуй ще" };

  const { created, skipped } = await applyPlanBlocks({
    supabase,
    userId: user.id,
    ymd,
    tz,
    seedBlocks: existing,
    plan,
    logKey: "today.plan",
  });

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

export type RescheduleState = {
  ok: boolean;
  moved?: number;
  dropped?: number;
  note?: string | null;
  error?: string;
};

export async function rescheduleAction(
  _prev: RescheduleState | null,
  formData: FormData,
): Promise<RescheduleState> {
  const userText = String(formData.get("text") ?? "").trim().slice(0, 1000);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const now = new Date();
  const nowMs = now.getTime();
  const ymd = getYMDInTZ(now, tz);
  const nowHHMM = getHHMMInTZ(now, tz);

  const blocks = await getBlocksForDate(supabase, user.id, now, tz);
  const toMove = blocks
    .filter((b) => new Date(b.end_at).getTime() > nowMs)
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );
  if (toMove.length === 0) {
    return { ok: false, error: "нема що переносити — решта дня вільна" };
  }

  const keep = blocks.filter((b) => new Date(b.end_at).getTime() <= nowMs);
  const keepLite: ExistingBlockLite[] = keep.map((b) => ({
    start: getHHMMInTZ(new Date(b.start_at), tz),
    end: getHHMMInTZ(new Date(b.end_at), tz),
    category: b.category,
    label: b.label,
  }));

  const moveItems: RescheduleMoveItem[] = toMove.map((b, i) => ({
    ref: i,
    category: b.category,
    label: b.label,
    durationMin: Math.round(
      (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60_000,
    ),
  }));

  const weekday = getWeekdayInTZ(now, tz);
  const result = await generateReschedule(
    moveItems,
    keepLite,
    profile,
    ymd,
    tz,
    nowHHMM,
    userText,
    weekday,
  );
  if (!result) {
    return { ok: false, error: "AI не зміг перепланувати, спробуй ще" };
  }

  // Occupied set for focus-rule checks: kept blocks + applied moves.
  const occupied: FocusCheckBlock[] = keep.map((b) => ({
    category: b.category,
    startMs: new Date(b.start_at).getTime(),
    endMs: new Date(b.end_at).getTime(),
  }));

  let moved = 0;
  let dropped = 0;

  // Apply in chronological order of proposed start.
  const ordered = [...result.blocks].sort(
    (a, b) => timeStringToMin(a.start) - timeStringToMin(b.start),
  );

  for (const r of ordered) {
    const item = moveItems.find((m) => m.ref === r.ref);
    if (!item) continue;
    const original = toMove[r.ref];
    if (!original) continue;
    if (r.drop === true) {
      dropped++;
      continue;
    }

    const sMin = timeStringToMin(r.start);
    let eMin = timeStringToMin(r.end);
    if (eMin <= sMin) {
      dropped++;
      continue;
    }

    // Trim focus blocks longer than MAX_FOCUS_MIN — parity with planner.
    // AI sometimes returns 55–60min focus despite the prompt rule; previously
    // we dropped the whole block, losing the user's work. Trim instead.
    if (isFocus(original.category) && eMin - sMin > MAX_FOCUS_MIN) {
      eMin = sMin + MAX_FOCUS_MIN;
    }

    const startISO = localDateTimeToUTC(ymd, r.start, tz).toISOString();
    const endISO = localDateTimeToUTC(ymd, formatTime(eMin), tz).toISOString();
    const candidate: FocusCheckBlock = {
      category: original.category,
      startMs: new Date(startISO).getTime(),
      endMs: new Date(endISO).getTime(),
    };

    // Gap violation can't be fixed locally — still drop.
    const check = validateFocusBlock(candidate, occupied);
    if (!check.ok) {
      dropped++;
      continue;
    }

    try {
      await updateBlock(supabase, original.id, {
        start_at: startISO,
        end_at: endISO,
        notified_ending_at: null,
        notified_started_at: null,
      });
      occupied.push(candidate);
      moved++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("time_blocks_no_overlap")) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "today.reschedule_apply_failed",
            error: msg,
          }),
        );
      }
      dropped++;
    }
  }

  revalidatePath("/today");
  return { ok: true, moved, dropped, note: result.note ?? null };
}

export async function setBlockMoodAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const moodRaw = String(formData.get("mood"));
  if (!id) return;
  if (moodRaw !== "fire" && moodRaw !== "ok" && moodRaw !== "swamp") return;
  const mood = moodRaw as Mood;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await updateBlock(supabase, id, { mood });
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.set_mood_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  revalidatePath("/today");
}

export type RebuildDayState = {
  ok: boolean;
  deleted?: number;
  created?: number;
  skipped?: number;
  note?: string | null;
  error?: string;
};

/**
 * "Rebuild day" — generate a brand-new plan from scratch, using only past
 * (completed) blocks as context. ONLY deletes existing future blocks after
 * the AI plan succeeds — if AI fails or times out, user's existing plan
 * stays intact. This is the "forget the plan, start over" escape hatch.
 */
export async function rebuildDayAction(
  _prev: RebuildDayState | null,
  formData: FormData,
): Promise<RebuildDayState> {
  const userText = String(formData.get("text") ?? "").trim();
  if (!userText) return { ok: false, error: "напиши що хочеш на залишок дня" };
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
  const nowMs = now.getTime();
  const nowISO = now.toISOString();
  const ymd = getYMDInTZ(now, tz);
  const weekday = getWeekdayInTZ(now, tz);

  // 1. Fetch all today's blocks; partition by start_at vs now.
  //   - "stays" = past + currently active (start_at <= now). AI plans
  //     around these and they survive deletion.
  //   - "future" = strictly after now (start_at > now). These get deleted
  //     once AI succeeds, but ONLY within today's local-day window.
  const allBlocks = await getBlocksForDate(supabase, user.id, now, tz);
  const staysBlocks = allBlocks.filter(
    (b) => new Date(b.start_at).getTime() <= nowMs,
  );
  const existingLite: ExistingBlockLite[] = staysBlocks.map((b) => ({
    start: getHHMMInTZ(new Date(b.start_at), tz),
    end: getHHMMInTZ(new Date(b.end_at), tz),
    category: b.category,
    label: b.label,
  }));

  // 2. Generate a fresh plan. No destructive action yet — if AI fails,
  // user keeps their existing future blocks.
  const plan = await generatePlan(
    userText,
    profile,
    existingLite,
    ymd,
    tz,
    weekday,
  );
  if (!plan) {
    return {
      ok: false,
      error: "AI не зміг побудувати план — нічого не змінив, спробуй ще",
    };
  }

  // 3. AI succeeded — now safe to clear blocks. Bound by today's local
  //    day end so future days (planned ahead, archive) are untouched.
  let deleted = 0;
  try {
    const { end: dayEnd } = localDayBoundsUTC(now, tz);
    deleted = await deleteFutureBlocksInDay(
      supabase,
      user.id,
      nowISO,
      dayEnd.toISOString(),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.rebuild_delete_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return { ok: false, error: "не зміг очистити майбутні блоки" };
  }

  // 4. Insert new blocks via shared planner-apply helper.
  const { created, skipped } = await applyPlanBlocks({
    supabase,
    userId: user.id,
    ymd,
    tz,
    seedBlocks: staysBlocks,
    plan,
    logKey: "today.rebuild",
  });

  revalidatePath("/today");
  return { ok: true, deleted, created, skipped, note: plan.note ?? null };
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
