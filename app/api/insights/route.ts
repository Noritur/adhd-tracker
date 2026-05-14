import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForDate, getBlocksForRange } from "@/lib/db/blocks";
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

  const now = new Date();
  const forDate = now.toISOString().split("T")[0];

  const insight = await getOrGenerateInsight(
    supabase,
    user.id,
    scope,
    forDate,
    async () => {
      let blocks;
      if (scope === "today") {
        blocks = await getBlocksForDate(supabase, user.id, now);
      } else {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        blocks = await getBlocksForRange(supabase, user.id, start, now);
      }
      return generateInsight(scope, blocks);
    },
  );

  return NextResponse.json(insight ?? { observation: null, recommendation: null });
}
