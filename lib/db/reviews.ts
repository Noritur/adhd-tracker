import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type ReviewResponse = "ok" | "skip" | "not_today";

export type Review = {
  id: number;
  user_id: string;
  for_date: string; // YYYY-MM-DD
  summary: string | null;
  recommendation: string | null;
  // biome-ignore lint/suspicious/noExplicitAny: jsonb payload is opaque
  raw_json: any | null;
  user_response: ReviewResponse | null;
  created_at: string;
};

export async function getReviewForDate(
  client: DbClient,
  userId: string,
  ymd: string,
): Promise<Review | null> {
  const { data, error } = await client
    .from("reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("for_date", ymd)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Review | null;
}

export type ReviewInsert = {
  user_id: string;
  for_date: string;
  summary: string | null;
  recommendation: string | null;
  // biome-ignore lint/suspicious/noExplicitAny: jsonb payload
  raw_json: any;
};

export async function insertReview(
  client: DbClient,
  input: ReviewInsert,
): Promise<Review> {
  const { data, error } = await client
    .from("reviews")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as Review;
}

export async function setReviewResponse(
  client: DbClient,
  id: number,
  userId: string,
  response: ReviewResponse,
): Promise<void> {
  const { error } = await client
    .from("reviews")
    .update({ user_response: response })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
