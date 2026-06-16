import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBlocksForDate, getBlocksForRange } from "@/lib/db/blocks";
import { insertReview } from "@/lib/db/reviews";
import { generateReview } from "@/lib/ai/review";
import {
  getHHMMInTZ,
  getYMDInTZ,
  getWeekdayInTZ,
  localMondayMidnightUTC,
  localWeekBoundsUTC,
} from "@/lib/time/tz";
import { timeStringToMin } from "@/lib/time/slots";
import { sendToUser } from "@/lib/push/send";
import { getWeekWord } from "@/lib/db/week-words";
import { getWeekSummary, setWeekSummary } from "@/lib/db/week-summaries";
import { generateWeekSummary } from "@/lib/ai/week-summary";
import type { Profile } from "@/lib/db/profile";
import { requireCronAuth } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 30-min window centered on the user's `evening_review_at` time.
// We're invoked HOURLY by cron-job.org (not Vercel daily cron — Vercel
// Hobby ran once at 19:00 UTC which only ever matched Europe; non-EU
// users were promised configurable review times but never got them).
// With hourly invocation + 30-min window, a user's target HH:MM gets
// matched in the right hour and skipped in adjacent hours via the
// existing per-(user, date) review uniqueness constraint.
const WINDOW_MIN = 30;

async function handler(request: Request): Promise<Response> {
  const authFail = requireCronAuth(request);
  if (authFail) return authFail;

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("*")
    .eq("evening_review_enabled", true);
  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "cron.review.fetch_profiles_failed",
        error: error.message,
      }),
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const now = new Date();
  const stats = {
    generated: 0,
    skipped_already: 0,
    skipped_no_blocks: 0,
    skipped_no_match: 0,
    failed: 0,
    summaries: 0,
  };

  for (const p of (profiles ?? []) as Profile[]) {
    const tz = p.timezone;
    const localHHMM = getHHMMInTZ(now, tz);
    const targetHHMM = (p.evening_review_at ?? "21:00:00").slice(0, 5);
    const cur = timeStringToMin(localHHMM);
    const target = timeStringToMin(targetHHMM);
    const rawDiff = Math.abs(cur - target);
    const diff = Math.min(rawDiff, 1440 - rawDiff);
    if (diff > WINDOW_MIN) {
      stats.skipped_no_match++;
      continue;
    }

    const ymd = getYMDInTZ(now, tz);

    const { data: existing } = await admin
      .from("reviews")
      .select("id")
      .eq("user_id", p.id)
      .eq("for_date", ymd)
      .maybeSingle();
    if (existing) {
      stats.skipped_already++;
      continue;
    }

    const blocks = await getBlocksForDate(admin, p.id, now, tz);
    if (blocks.length === 0) {
      stats.skipped_no_blocks++;
      continue;
    }

    const weekday = getWeekdayInTZ(now, tz);
    const review = await generateReview(p, blocks, weekday, tz);
    if (!review) {
      stats.failed++;
      continue;
    }

    try {
      await insertReview(admin, {
        user_id: p.id,
        for_date: ymd,
        summary: review.summary,
        recommendation: review.recommendation,
        raw_json: review,
      });
      stats.generated++;

      // Fire-and-log: don't block cron stats on push delivery.
      const preview = review.summary.length > 110
        ? `${review.summary.slice(0, 107)}...`
        : review.summary;
      const pushResult = await sendToUser(p.id, {
        title: "вечірнє ревью",
        body: preview,
        url: "/today",
        tag: `review-${ymd}`,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "cron.review.push_dispatched",
          user: p.id,
          sent: pushResult.sent,
          failed: pushResult.failed,
        }),
      );
    } catch (e) {
      stats.failed++;
      console.error(
        JSON.stringify({
          level: "error",
          msg: "cron.review.insert_failed",
          user: p.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  // Friday word-of-the-week push: if today is Friday in user's TZ and
  // they haven't set a word for this week yet, nudge them.
  let wordPushes = 0;
  for (const p of (profiles ?? []) as Profile[]) {
    const tz = p.timezone;
    const weekday = getWeekdayInTZ(now, tz); // 0=Sun..6=Sat
    if (weekday !== 5) continue; // only Friday

    // Check time window (same as review: within WINDOW_MIN of review time).
    const localHHMM = getHHMMInTZ(now, tz);
    const targetHHMM = (p.evening_review_at ?? "21:00:00").slice(0, 5);
    const cur = timeStringToMin(localHHMM);
    const target = timeStringToMin(targetHHMM);
    const rawDiff = Math.abs(cur - target);
    const diff = Math.min(rawDiff, 1440 - rawDiff);
    if (diff > WINDOW_MIN) continue;

    const mondayUTC = localMondayMidnightUTC(now, tz);
    const mondayYMD = getYMDInTZ(mondayUTC, tz);
    const existing = await getWeekWord(admin, p.id, mondayYMD);
    if (existing) continue;

    try {
      await sendToUser(p.id, {
        title: "слово тижня",
        body: "одне слово або фраза — якорь. шо це був за тиждень?",
        url: "/week",
        tag: `week-word-${mondayYMD}`,
      });
      wordPushes++;
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "cron.review.word_push_failed",
          user: p.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  // Sunday week-summary generation: same TZ window as review, but only on
  // Sunday. Once per user per week (idempotent via unique (user_id,
  // week_start)). A frozen narrative recap that later feeds coach memory.
  for (const p of (profiles ?? []) as Profile[]) {
    const tz = p.timezone;
    if (getWeekdayInTZ(now, tz) !== 0) continue; // only Sunday (0=Sun)

    const localHHMM = getHHMMInTZ(now, tz);
    const targetHHMM = (p.evening_review_at ?? "21:00:00").slice(0, 5);
    const cur = timeStringToMin(localHHMM);
    const target = timeStringToMin(targetHHMM);
    const rawDiff = Math.abs(cur - target);
    const diff = Math.min(rawDiff, 1440 - rawDiff);
    if (diff > WINDOW_MIN) continue;

    const monday = localMondayMidnightUTC(now, tz);
    const mondayYMD = getYMDInTZ(monday, tz);
    if (await getWeekSummary(admin, p.id, mondayYMD)) continue; // already done

    const { start, end } = localWeekBoundsUTC(now, tz);
    const blocks = await getBlocksForRange(admin, p.id, start, end);
    if (blocks.length === 0) continue;

    const summary = await generateWeekSummary(p, blocks, mondayYMD, tz);
    if (!summary) continue;

    try {
      await setWeekSummary(admin, p.id, mondayYMD, summary.summary, summary);
      stats.summaries++;
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "cron.review.summary_failed",
          user: p.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.log(
    JSON.stringify({ level: "info", msg: "cron.review.done", stats, wordPushes }),
  );
  return NextResponse.json({ ok: true, stats, wordPushes });
}

export async function POST(request: Request) {
  return handler(request);
}

// GET enables Vercel's default cron invocation + manual curl with same auth.
export async function GET(request: Request) {
  return handler(request);
}
