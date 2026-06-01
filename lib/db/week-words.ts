import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type WeekWord = {
  id: number;
  user_id: string;
  week_start: string; // YYYY-MM-DD (Monday)
  word: string;
  created_at: string;
};

/** Get word for a specific week (by Monday YYYY-MM-DD). */
export async function getWeekWord(
  client: DbClient,
  userId: string,
  weekStart: string,
): Promise<WeekWord | null> {
  const { data, error } = await client
    .from("week_words")
    .select("id, user_id, week_start, word, created_at")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return data as WeekWord | null;
}

/** Upsert word for a week. */
export async function setWeekWord(
  client: DbClient,
  userId: string,
  weekStart: string,
  word: string,
): Promise<WeekWord> {
  const { data, error } = await client
    .from("week_words")
    .upsert(
      { user_id: userId, week_start: weekStart, word },
      { onConflict: "user_id,week_start" },
    )
    .select("id, user_id, week_start, word, created_at")
    .single();
  if (error) throw error;
  return data as WeekWord;
}
