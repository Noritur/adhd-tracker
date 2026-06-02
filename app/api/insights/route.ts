import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForDate, getBlocksForRange } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { getYMDInTZ, getWeekdayInTZ, localDayBoundsUTC } from "@/lib/time/tz";
import { generateInsight } from "@/lib/ai/insights";
import { getOrGenerateInsight } from "@/lib/ai/cache";
import type { InsightScope } from "@/lib/ai/prompts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawScope = searchParams.get("scope");
  const scope: InsightScope =
    rawScope === "week" ? "week" : "today";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const now = new Date();
  const forDate = getYMDInTZ(now, tz);

  const insight = await getOrGenerateInsight(
    supabase,
    user.id,
    scope,
    forDate,
    async () => {
      let blocks;
      if (scope === "today") {
        blocks = await getBlocksForDate(supabase, user.id, now, tz);
      } else {
        const { end } = localDayBoundsUTC(now, tz);
        const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        blocks = await getBlocksForRange(supabase, user.id, start, end);
      }
      const weekday =
        scope === "today" ? getWeekdayInTZ(now, tz) : null;
      return generateInsight(scope, blocks, profile, weekday, tz);
    },
  );

  return NextResponse.json(insight ?? { observation: null, recommendation: null });
}
