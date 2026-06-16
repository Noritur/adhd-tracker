import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type WeekSummary = {
  id: number;
  user_id: string;
  week_start: string; // YYYY-MM-DD (Monday)
  summary: string;
  raw_json: unknown | null;
  created_at: string;
};

/** Get AI week summary for a specific week (by Monday YYYY-MM-DD). */
export async function getWeekSummary(
  client: DbClient,
  userId: string,
  weekStart: string,
): Promise<WeekSummary | null> {
  const { data, error } = await client
    .from("week_summaries")
    .select("id, user_id, week_start, summary, raw_json, created_at")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as WeekSummary | null;
}

/** Upsert AI-generated summary for a week. */
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
    .select("id, user_id, week_start, summary, raw_json, created_at")
    .single();
  if (error) throw error;
  return data as WeekSummary;
}
