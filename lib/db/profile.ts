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
  rest_days: number[]; // 0=Sun..6=Sat. Default [6,0].
  last_proactive_at: string | null;
  last_morning_nudge_at: string | null;
  created_at: string;
};

export type ProfilePatch = Partial<{
  timezone: string;
  work_hours_start: string;
  work_hours_end: string;
  ai_tone: AiTone;
  evening_review_at: string;
  evening_review_enabled: boolean;
  rest_days: number[];
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

export const DEFAULT_REST_DAYS = [6, 0]; // Sat, Sun

export function profileRestDays(profile: Profile | null): number[] {
  return profile?.rest_days?.length ? profile.rest_days : DEFAULT_REST_DAYS;
}

/** Is weekday `wd` (0=Sun..6=Sat) marked as rest day for this profile? */
export function isRestWeekday(
  profile: Profile | null,
  weekday: number,
): boolean {
  return profileRestDays(profile).includes(weekday);
}
