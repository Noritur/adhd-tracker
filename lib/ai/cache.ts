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
  // Upsert so two concurrent generations don't race (previous version did
  // delete-then-insert with no error handling — both racers could end up
  // with no row). Refresh created_at so TTL window restarts.
  const content = `${insight.observation}\n\n${insight.recommendation}`;
  const { error } = await client.from("insights_cache").upsert(
    {
      user_id: userId,
      scope,
      for_date: forDate,
      content,
      raw_json: insight,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scope,for_date" },
  );
  if (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        msg: "ai.cache.upsert_failed",
        error: error.message,
      }),
    );
  }
}

/**
 * Drop every cached insight row for a user. Called from any write path
 * that changes block data, mood, or profile prompt context — otherwise
 * the visible InsightsCard would keep showing pre-write coaching for up
 * to 2 hours, which is the main "ai layer visibly lies" failure mode.
 *
 * Cache is per-(user, scope, for_date) so each user has 1–2 rows; the
 * brute-force delete is cheap and keeps invalidation logic simple at
 * call sites.
 */
export async function invalidateInsightsCache(
  client: DbClient,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from("insights_cache")
    .delete()
    .eq("user_id", userId);
  if (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        msg: "ai.cache.invalidate_failed",
        error: error.message,
      }),
    );
  }
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
