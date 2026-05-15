import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBlocksForTick, updateBlock } from "@/lib/db/blocks";
import { getSubscriptionsForUser } from "@/lib/db/push-subscriptions";
import { sendToSubscription } from "@/lib/push/send";
import { CATEGORIES_BY_VALUE } from "@/lib/categories";
import type { Profile } from "@/lib/db/profile";

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
  const stats = { started: 0, ending: 0, users: 0, no_subs: 0 };

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

      // Block just started.
      if (
        !b.notified_started_at &&
        msSinceStart >= 0 &&
        msSinceStart <= STARTED_WINDOW_MS
      ) {
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
        await updateBlock(admin, b.id, { notified_started_at: nowISO });
        stats.started++;
      }

      // Block ending soon (<=5 min left).
      if (
        !b.notified_ending_at &&
        msToEnd > 0 &&
        msToEnd <= ENDING_WINDOW_MS
      ) {
        const minsLeft = Math.max(1, Math.round(msToEnd / 60_000));
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
        await updateBlock(admin, b.id, { notified_ending_at: nowISO });
        stats.ending++;
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
