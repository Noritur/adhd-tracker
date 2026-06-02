import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHHMMInTZ, getWeekdayInTZ } from "@/lib/time/tz";
import { timeStringToMin } from "@/lib/time/slots";
import { sendToUser } from "@/lib/push/send";
import { isRestWeekday, type Profile } from "@/lib/db/profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MIN = 60;

const NUDGE_MESSAGES = [
  "доброго ранку. скажи що сьогодні треба — розкидаю по таймлайну.",
  "ранок. накидаємо план?",
  "ну що, який сьогодні режим? тицяй ранковий план.",
];

const REST_DAY_NUDGES = [
  "ранок вихідного. план не обов'язковий — але якщо щось хочеш зробити, кинь.",
  "вихідний. без structure, просто пливем. або стукни план — як хочеш.",
  "сьогодні дозволено нічого не робити. але якщо щось хочеш, я тут.",
];

async function handler(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  // Reuse evening_review_enabled as a proxy for "wants nudges" — keeps the
  // settings UI simple. Add a dedicated flag later if user wants to split.
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("*")
    .eq("evening_review_enabled", true);
  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "cron.morning_nudge.fetch_profiles_failed",
        error: error.message,
      }),
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const now = new Date();
  const stats = {
    dispatched: 0,
    dispatched_rest: 0,
    skipped_no_match: 0,
    no_subs: 0,
    failed: 0,
  };

  for (const p of (profiles ?? []) as Profile[]) {
    const tz = p.timezone;
    const localHHMM = getHHMMInTZ(now, tz);
    const targetHHMM = (p.work_hours_start ?? "09:00:00").slice(0, 5);
    const cur = timeStringToMin(localHHMM);
    const target = timeStringToMin(targetHHMM);
    const rawDiff = Math.abs(cur - target);
    const diff = Math.min(rawDiff, 1440 - rawDiff);
    if (diff > WINDOW_MIN) {
      stats.skipped_no_match++;
      continue;
    }

    const weekday = getWeekdayInTZ(now, tz);
    const isRest = isRestWeekday(p, weekday);
    const pool = isRest ? REST_DAY_NUDGES : NUDGE_MESSAGES;
    const body = pool[Math.floor(Math.random() * pool.length)];

    try {
      const res = await sendToUser(p.id, {
        title: "ритм",
        body,
        url: "/today",
        tag: "morning-nudge",
      });
      if (res.sent === 0 && res.failed === 0) {
        stats.no_subs++;
      } else if (isRest) {
        stats.dispatched_rest++;
      } else {
        stats.dispatched++;
      }
    } catch (e) {
      stats.failed++;
      console.error(
        JSON.stringify({
          level: "error",
          msg: "cron.morning_nudge.send_failed",
          user: p.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.log(
    JSON.stringify({ level: "info", msg: "cron.morning_nudge.done", stats }),
  );
  return NextResponse.json({ ok: true, stats });
}

export async function POST(request: Request) {
  return handler(request);
}

export async function GET(request: Request) {
  return handler(request);
}
