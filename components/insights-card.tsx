import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForDate, getBlocksForRange } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import {
  getYMDInTZ,
  getWeekdayInTZ,
  localWeekBoundsUTC,
} from "@/lib/time/tz";
import { generateInsight } from "@/lib/ai/insights";
import { getOrGenerateInsight } from "@/lib/ai/cache";
import type { InsightScope } from "@/lib/ai/prompts";

type Props = {
  scope: InsightScope;
  /**
   * For `scope="week"`: the calendar week (Mon-Sun in user TZ) to insight
   * over. When viewing `/week?week=<past>`, the page passes the archive
   * week's bounds so the AI insight matches what the heatmap shows.
   * If omitted, falls back to the current calendar week.
   * For `scope="today"`, ignored.
   */
  weekStart?: Date;
  weekEnd?: Date;
};

export async function InsightsCard({ scope, weekStart, weekEnd }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const now = new Date();

  // Cache key depends on scope:
  //   today → today's YMD
  //   week  → Monday YMD of the target week (so archive weeks each get
  //           their own cache row instead of overwriting "current week")
  let forDate: string;
  if (scope === "today") {
    forDate = getYMDInTZ(now, tz);
  } else {
    const { start: ws } = weekStart && weekEnd
      ? { start: weekStart }
      : localWeekBoundsUTC(now, tz);
    forDate = getYMDInTZ(ws, tz);
  }

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
        // Use passed bounds for archive weeks, current calendar week otherwise.
        const bounds = weekStart && weekEnd
          ? { start: weekStart, end: weekEnd }
          : localWeekBoundsUTC(now, tz);
        blocks = await getBlocksForRange(
          supabase,
          user.id,
          bounds.start,
          bounds.end,
        );
      }
      // Rest-day awareness only makes sense for "today" scope (single
      // weekday). "week" spans both rest + work days, leave null so the
      // prompt skips the rest-day block instead of misapplying it.
      const weekday = scope === "today" ? getWeekdayInTZ(now, tz) : null;
      return generateInsight(scope, blocks, profile, weekday, tz);
    },
  );

  // No blocks yet → don't render anything (let the empty state in the page handle it).
  if (!insight) return null;

  return (
    <div className="glass-light rounded-3xl p-4 flex gap-3 items-start">
      <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-primary" />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--accent-warm)]">
          тренер
        </span>
        <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">
          {insight.observation}
        </p>
        <p className="text-sm text-[var(--text-secondary)] leading-snug whitespace-pre-wrap pt-1 border-t border-border/40">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
            що робити
          </span>
          {insight.recommendation}
        </p>
      </div>
    </div>
  );
}

export function InsightsCardSkeleton() {
  return (
    <div className="glass-light rounded-3xl p-4 flex gap-3 items-start">
      <div className="w-9 h-9 rounded-2xl bg-primary/5 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-primary/40" />
      </div>
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          тренер думает...
        </span>
        <div className="h-3 bg-muted/40 rounded-full w-full animate-pulse" />
        <div className="h-3 bg-muted/40 rounded-full w-2/3 animate-pulse" />
        <div className="h-3 bg-muted/30 rounded-full w-3/4 animate-pulse mt-1" />
      </div>
    </div>
  );
}
