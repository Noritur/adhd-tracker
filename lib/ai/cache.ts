import type { SupabaseClient } from "@supabase/supabase-js";
import type { Insight } from "./insights";
import type { InsightScope } from "./prompts";

// biome-ignore lint/suspicious/noExplicitAny: schema generic loose intentionally
type DbClient = SupabaseClient<any, any, any>;

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function getCachedInsight(
  client: DbClient,
  userId: string,
  scope: InsightScope,
  forDate: string, // 'YYYY-MM-DD'
): Promise<Insight | null> {
  const { data } = await client
    .from("insights_cache")
    .select("raw_json, created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("for_date", forDate)
    .maybeSingle();

  if (!data) return null;

  const age = Date.now() - new Date(data.created_at).getTime();
  if (age > TTL_MS) return null;

  return data.raw_json as Insight;
}

export async function setCachedInsight(
  client: DbClient,
  userId: string,
  scope: InsightScope,
  forDate: string,
  insight: Insight,
): Promise<void> {
  // Delete old row + insert new (unique constraint on user_id/scope/for_date).
  await client
    .from("insights_cache")
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("for_date", forDate);

  const content = `${insight.observation}\n\n${insight.recommendation}`;
  await client.from("insights_cache").insert({
    user_id: userId,
    scope,
    for_date: forDate,
    content,
    raw_json: insight,
  });
}

/** Top-level service: returns cached if fresh, else generates + caches. */
export async function getOrGenerateInsight(
  client: DbClient,
  userId: string,
  scope: InsightScope,
  forDate: string,
  generate: () => Promise<Insight | null>,
): Promise<Insight | null> {
  const cached = await getCachedInsight(client, userId, scope, forDate);
  if (cached) return cached;

  const fresh = await generate();
  if (!fresh) return null;

  await setCachedInsight(client, userId, scope, forDate, fresh);
  return fresh;
}
