import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/lib/categories";
import { DEFAULT_TIMEZONE, localDayBoundsUTC } from "@/lib/time/tz";

// Our server/browser clients are schema-scoped to `adhd_tracker`. The
// generic on SupabaseClient encodes the schema name, so we accept any
// schema-scoped variant here to keep call-sites simple.
// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type Mood = "fire" | "ok" | "swamp";

export type Block = {
  id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  category: Category;
  label: string | null;
  mood: Mood | null;
};

export type BlockInsert = {
  user_id: string;
  start_at: string;
  end_at: string;
  category: Category;
  label: string | null;
};

export type BlockPatch = Partial<{
  start_at: string;
  end_at: string;
  category: Category;
  label: string | null;
  mood: Mood | null;
  notified_ending_at: string | null;
  notified_started_at: string | null;
}>;

export type TickBlock = {
  id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  category: Category;
  label: string | null;
  mood: Mood | null;
  notified_ending_at: string | null;
  notified_started_at: string | null;
};

/** Same-day blocks including notify columns — for the block-tick cron. */
export async function getBlocksForTick(
  client: DbClient,
  userId: string,
  localDate: Date,
  tz: string = DEFAULT_TIMEZONE,
): Promise<TickBlock[]> {
  const { start, end } = localDayBoundsUTC(localDate, tz);
  const { data, error } = await client
    .from("time_blocks")
    .select(
      "id, user_id, start_at, end_at, category, label, mood, notified_ending_at, notified_started_at",
    )
    .eq("user_id", userId)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TickBlock[];
}

export async function getBlocksForDate(
  client: DbClient,
  userId: string,
  localDate: Date,
  tz: string = DEFAULT_TIMEZONE,
): Promise<Block[]> {
  const { start, end } = localDayBoundsUTC(localDate, tz);

  const { data, error } = await client
    .from("time_blocks")
    .select("id, user_id, start_at, end_at, category, label, mood")
    .eq("user_id", userId)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Block[];
}

/**
 * Fetch every block whose start_at falls inside [startUTC, endUTC).
 * Callers pre-compute UTC bounds (e.g. via localWeekBoundsUTC).
 */
export async function getBlocksForRange(
  client: DbClient,
  userId: string,
  startUTC: Date,
  endUTC: Date,
): Promise<Block[]> {
  const { data, error } = await client
    .from("time_blocks")
    .select("id, user_id, start_at, end_at, category, label, mood")
    .eq("user_id", userId)
    .gte("start_at", startUTC.toISOString())
    .lt("start_at", endUTC.toISOString())
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Block[];
}

export async function createBlock(
  client: DbClient,
  input: BlockInsert,
): Promise<Block> {
  const { data, error } = await client
    .from("time_blocks")
    .insert(input)
    .select("id, user_id, start_at, end_at, category, label, mood")
    .single();

  if (error) throw error;
  return data as Block;
}

export async function updateBlock(
  client: DbClient,
  id: number,
  patch: BlockPatch,
): Promise<Block> {
  const { data, error } = await client
    .from("time_blocks")
    .update(patch)
    .eq("id", id)
    .select("id, user_id, start_at, end_at, category, label, mood")
    .single();

  if (error) throw error;
  return data as Block;
}

export async function deleteBlock(
  client: DbClient,
  id: number,
): Promise<void> {
  const { error } = await client.from("time_blocks").delete().eq("id", id);
  if (error) throw error;
}
