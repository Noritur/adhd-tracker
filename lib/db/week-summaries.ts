import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

const COLS =
  "id, user_id, week_start, summary, raw_json, user_note, advice, advice_json, created_at";

export type WeekSummary = {
  id: number;
  user_id: string;
  week_start: string; // YYYY-MM-DD (Monday)
  summary: string;
  raw_json: unknown | null;
  user_note: string | null; // my weekly reflection input
  advice: string | null; // coach advice generated from note + memory
  advice_json: unknown | null;
  created_at: string;
};

/** Get AI week summary (+ reflection) for a specific week (Monday YYYY-MM-DD). */
export async function getWeekSummary(
  client: DbClient,
  userId: string,
  weekStart: string,
): Promise<WeekSummary | null> {
  const { data, error } = await client
    .from("week_summaries")
    .select(COLS)
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as WeekSummary | null;
}

/** Upsert AI-generated summary for a week (Sunday cron). */
export async function setWeekSummary(
  client: DbClient,
  userId: string,
  weekStart: string,
  summary: string,
  rawJson: unknown = null,
): Promise<WeekSummary> {
  const { data, error } = await client
    .from("week_summaries")
    .upsert(
      { user_id: userId, week_start: weekStart, summary, raw_json: rawJson },
      { onConflict: "user_id,week_start" },
    )
    .select(COLS)
    .single();
  if (error) throw error;
  return data as WeekSummary;
}

/** Save the user's weekly reflection note + coach advice onto the week row. */
export async function setWeekReflection(
  client: DbClient,
  userId: string,
  weekStart: string,
  userNote: string,
  advice: string,
  adviceJson: unknown = null,
): Promise<WeekSummary> {
  const { data, error } = await client
    .from("week_summaries")
    .update({ user_note: userNote, advice, advice_json: adviceJson })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .select(COLS)
    .single();
  if (error) throw error;
  return data as WeekSummary;
}

/** Past weeks before `beforeWeekStart`, newest first — long-term coach memory. */
export async function getWeekSummariesForRange(
  client: DbClient,
  userId: string,
  beforeWeekStart: string,
  limit = 8,
): Promise<WeekSummary[]> {
  const { data, error } = await client
    .from("week_summaries")
    .select(COLS)
    .eq("user_id", userId)
    .lt("week_start", beforeWeekStart)
    .order("week_start", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WeekSummary[];
}
