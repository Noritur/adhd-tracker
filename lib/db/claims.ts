/**
 * Claim-before-send for the cron routes.
 *
 * A claim is an UPDATE that only matches while the notification has not gone
 * out yet. When two cron runs overlap, exactly one of them gets the row back
 * and sends; the other gets an empty result and skips. The database half of
 * that guarantee is tested in tests/db/claims.test.ts, the query shape built
 * here in tests/unit/claims.test.ts.
 *
 * Errors are not inspected: a failed claim reads as "not claimed" and the
 * caller skips, same as losing the race.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// biome-ignore lint/suspicious/noExplicitAny: schema generic intentionally loose
type DbClient = SupabaseClient<any, any, any>;

export type BlockNotifyField = "notified_started_at" | "notified_ending_at";
export type DailySlotField = "last_proactive_at" | "last_morning_nudge_at";

/** Claims a block's start or end notification. True only for the caller that won. */
export async function claimBlockNotification(
  client: DbClient,
  blockId: number,
  field: BlockNotifyField,
  nowISO: string,
): Promise<boolean> {
  const { data: claimed } = await client
    .from("time_blocks")
    .update({ [field]: nowISO })
    .eq("id", blockId)
    .is(field, null)
    .select("id");
  return !!claimed && claimed.length > 0;
}

/**
 * Claims a once-per-local-day slot on the profile: free when it was never
 * used or last used before `dayStartISO` (the user's local midnight).
 */
export async function claimDailySlot(
  client: DbClient,
  profileId: string,
  field: DailySlotField,
  nowISO: string,
  dayStartISO: string,
): Promise<boolean> {
  const { data: claimed } = await client
    .from("profiles")
    .update({ [field]: nowISO })
    .eq("id", profileId)
    .or(`${field}.is.null,${field}.lt.${dayStartISO}`)
    .select("id");
  return !!claimed && claimed.length > 0;
}
