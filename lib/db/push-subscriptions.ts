import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type PushSubscriptionRow = {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
};

export type PushSubscriptionInsert = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
};

export async function getSubscriptionsForUser(
  client: DbClient,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await client
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRow[];
}

export async function getSubscriptionByEndpoint(
  client: DbClient,
  endpoint: string,
): Promise<PushSubscriptionRow | null> {
  const { data, error } = await client
    .from("push_subscriptions")
    .select("*")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PushSubscriptionRow | null;
}

export async function upsertSubscription(
  client: DbClient,
  input: PushSubscriptionInsert,
): Promise<PushSubscriptionRow> {
  // Upsert on endpoint UNIQUE: same browser re-subscribing keeps the row.
  const { data, error } = await client
    .from("push_subscriptions")
    .upsert(input, { onConflict: "endpoint" })
    .select("*")
    .single();
  if (error) throw error;
  return data as PushSubscriptionRow;
}

export async function deleteSubscriptionByEndpoint(
  client: DbClient,
  endpoint: string,
  userId?: string,
): Promise<void> {
  let q = client.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (userId) q = q.eq("user_id", userId);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteSubscriptionsForUser(
  client: DbClient,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}
