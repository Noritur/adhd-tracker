import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBlocksForTick, type TickBlock } from "@/lib/db/blocks";
import { getSubscriptionsForUser } from "@/lib/db/push-subscriptions";
import { sendToSubscription } from "@/lib/push/send";
import { CATEGORIES_BY_VALUE } from "@/lib/categories";
import { isFocus } from "@/lib/rules/focus-limits";
import { getYMDInTZ, localDayBoundsUTC } from "@/lib/time/tz";
import { generateCoachNudge, type NudgeKind } from "@/lib/ai/coach-nudge";
import type { Profile } from "@/lib/db/profile";

const FOCUS_GAP_MS = 15 * 60_000;

/** Detect a proactive-coaching pattern among today's completed blocks. */
function detectNudge(blocks: TickBlock[], nowMs: number): NudgeKind | null {
  const completed = blocks
    .filter((b) => new Date(b.end_at).getTime() <= nowMs)
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

  // Priority 1: two most recent rated blocks both "swamp".
  const rated = completed.filter((b) => b.mood !== null);
  if (
    rated.length >= 2 &&
    rated[rated.length - 1].mood === "swamp" &&
    rated[rated.length - 2].mood === "swamp"
  ) {
    return "swamp_streak";
  }

  // Priority 2: two focus blocks back-to-back with <15min non-focus gap.
  let prevFocusEnd: number | null = null;
  for (const b of completed) {
    if (isFocus(b.category)) {
      const startMs = new Date(b.start_at).getTime();
      if (prevFocusEnd !== null && startMs - prevFocusEnd < FOCUS_GAP_MS) {
        return "focus_no_break";
      }
      prevFocusEnd = new Date(b.end_at).getTime();
    } else {
      prevFocusEnd = null; // a real break happened
    }
  }

  return null;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENDING_WINDOW_MS = 5 * 60_000; // notify when <=5 min remain
const STARTED_WINDOW_MS = 2 * 60_000; // notify within 2 min of start

function blockName(label: string | null, category: string): string {
  if (label && label.trim()) return label.trim();
  return CATEGORIES_BY_VALUE[category as keyof typeof CATEGORIES_BY_VALUE]
    ?.label ?? "блок";
}

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
        msg: "cron.block_tick.fetch_profiles_failed",
        error: error.message,
      }),
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const stats = { started: 0, ending: 0, coached: 0, users: 0, no_subs: 0 };

  for (const p of (profiles ?? []) as Profile[]) {
    const subs = await getSubscriptionsForUser(admin, p.id);
    if (subs.length === 0) {
      stats.no_subs++;
      continue;
    }
    stats.users++;

    const blocks = await getBlocksForTick(admin, p.id, new Date(now), p.timezone);

    for (const b of blocks) {
      const startMs = new Date(b.start_at).getTime();
      const endMs = new Date(b.end_at).getTime();
      const msToEnd = endMs - now;
      const msSinceStart = now - startMs;
      const name = blockName(b.label, b.category);

      // Block just started. CLAIM the row atomically before sending so
      // two overlapping cron invocations don't both fire the push:
      // the .is("notified_started_at", null) filter means at most one
      // UPDATE will return a row, the other gets [] and skips.
      if (
        !b.notified_started_at &&
        msSinceStart >= 0 &&
        msSinceStart <= STARTED_WINDOW_MS
      ) {
        const { data: claimed } = await admin
          .from("time_blocks")
          .update({ notified_started_at: nowISO })
          .eq("id", b.id)
          .is("notified_started_at", null)
          .select("id");
        if (claimed && claimed.length > 0) {
          await Promise.all(
            subs.map((s) =>
              sendToSubscription(s, {
                title: "почався блок",
                body: name,
                url: "/today",
                tag: `block-${b.id}-start`,
              }),
            ),
          );
          stats.started++;
        }
      }

      // Block ending soon (<=5 min left). Same atomic-claim pattern.
      if (
        !b.notified_ending_at &&
        msToEnd > 0 &&
        msToEnd <= ENDING_WINDOW_MS
      ) {
        const minsLeft = Math.max(1, Math.round(msToEnd / 60_000));
        const { data: claimed } = await admin
          .from("time_blocks")
          .update({ notified_ending_at: nowISO })
          .eq("id", b.id)
          .is("notified_ending_at", null)
          .select("id");
        if (claimed && claimed.length > 0) {
          await Promise.all(
            subs.map((s) =>
              sendToSubscription(s, {
                title: `~${minsLeft} хв до кінця`,
                body: `${name} — час закруглятись`,
                url: "/today",
                tag: `block-${b.id}-end`,
              }),
            ),
          );
          stats.ending++;
        }
      }
    }

    // Proactive coaching — max once per local day.
    const alreadyToday =
      p.last_proactive_at != null &&
      getYMDInTZ(new Date(p.last_proactive_at), p.timezone) ===
        getYMDInTZ(new Date(now), p.timezone);
    if (!alreadyToday) {
      const kind = detectNudge(blocks, now);
      if (kind) {
        // Atomic claim BEFORE the expensive AI call: race-safe gating
        // against duplicate cron firings + saves Gemini cost on the
        // loser. Filter: profile.last_proactive_at must be null OR
        // older than today's local-day start.
        const { start: dayStart } = localDayBoundsUTC(new Date(now), p.timezone);
        const dayStartISO = dayStart.toISOString();
        const { data: claimed } = await admin
          .from("profiles")
          .update({ last_proactive_at: nowISO })
          .eq("id", p.id)
          .or(
            `last_proactive_at.is.null,last_proactive_at.lt.${dayStartISO}`,
          )
          .select("id");
        if (claimed && claimed.length > 0) {
          const line = await generateCoachNudge(kind, p);
          if (line) {
            await Promise.all(
              subs.map((s) =>
                sendToSubscription(s, {
                  title: "коуч",
                  body: line,
                  url: "/today",
                  tag: `coach-${getYMDInTZ(new Date(now), p.timezone)}`,
                }),
              ),
            );
            stats.coached++;
          }
          // If line is null (AI exhausted), the claim still stands —
          // single failure consumes the day's slot. Acceptable trade-off
          // vs more complex rollback logic.
        }
      }
    }
  }

  console.log(
    JSON.stringify({ level: "info", msg: "cron.block_tick.done", stats }),
  );
  return NextResponse.json({ ok: true, stats });
}

export async function POST(request: Request) {
  return handler(request);
}

export async function GET(request: Request) {
  return handler(request);
}
