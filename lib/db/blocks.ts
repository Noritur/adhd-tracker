import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/lib/categories";

// Our server/browser clients are schema-scoped to `adhd_tracker`. The
// generic on SupabaseClient encodes the schema name, so we accept any
// schema-scoped variant here to keep call-sites simple.
// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type Block = {
  id: number;
  user_id: string;
  start_at: string;
  end_at: string;
  category: Category;
  label: string | null;
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
}>;

export async function getBlocksForDate(
  client: DbClient,
  userId: string,
  localDate: Date,
): Promise<Block[]> {
  // Calculate local-midnight bounds in browser's TZ (server matches user
  // intent better than UTC bounds for Europe/Madrid timezone).
  const start = new Date(localDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await client
    .from("time_blocks")
    .select("id, user_id, start_at, end_at, category, label")
    .eq("user_id", userId)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Block[];
}

/**
 * Fetch every block whose start_at falls inside [startLocal, endLocal).
 * Used by /week — passes Monday→Sunday local-midnight bounds.
 */
export async function getBlocksForRange(
  client: DbClient,
  userId: string,
  startLocal: Date,
  endLocal: Date,
): Promise<Block[]> {
  const { data, error } = await client
    .from("time_blocks")
    .select("id, user_id, start_at, end_at, category, label")
    .eq("user_id", userId)
    .gte("start_at", startLocal.toISOString())
    .lt("start_at", endLocal.toISOString())
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
    .select("id, user_id, start_at, end_at, category, label")
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
    .select("id, user_id, start_at, end_at, category, label")
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
