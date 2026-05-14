import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBlocksForDate } from "@/lib/db/blocks";
import { insertReview } from "@/lib/db/reviews";
import { generateReview } from "@/lib/ai/review";
import { getHHMMInTZ, getYMDInTZ } from "@/lib/time/tz";
import { timeStringToMin } from "@/lib/time/slots";
import type { Profile } from "@/lib/db/profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MIN = 60;

async function handler(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

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

    const review = await generateReview(p, blocks);
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

  console.log(
    JSON.stringify({ level: "info", msg: "cron.review.done", stats }),
  );
  return NextResponse.json({ ok: true, stats });
}

export async function POST(request: Request) {
  return handler(request);
}

// GET enables Vercel's default cron invocation + manual curl with same auth.
export async function GET(request: Request) {
  return handler(request);
}
