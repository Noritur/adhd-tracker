import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE } from "@/lib/time/tz";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type AiTone = "firm" | "gentle";

export type Profile = {
  id: string;
  timezone: string;
  work_hours_start: string; // "HH:MM:SS"
  work_hours_end: string;
  ai_tone: AiTone;
  evening_review_at: string; // "HH:MM:SS"
  evening_review_enabled: boolean;
  created_at: string;
};

export type ProfilePatch = Partial<{
  timezone: string;
  work_hours_start: string;
  work_hours_end: string;
  ai_tone: AiTone;
  evening_review_at: string;
  evening_review_enabled: boolean;
}>;

export async function getProfile(
  client: DbClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Profile | null;
}

export async function upsertProfile(
  client: DbClient,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const { data, error } = await client
    .from("profiles")
    .upsert({ id: userId, ...patch })
    .select("*")
    .single();
  if (error) throw error;
  return data as Profile;
}

export function profileTimezone(profile: Profile | null): string {
  return profile?.timezone || DEFAULT_TIMEZONE;
}
