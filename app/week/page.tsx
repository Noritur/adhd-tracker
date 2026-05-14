import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForRange } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { getYMDInTZ, localWeekBoundsUTC } from "@/lib/time/tz";
import { SummaryTiles } from "@/components/summary-tiles";
import { WeeklyHeatmap } from "@/components/weekly-heatmap";
import { BottomNav } from "@/components/bottom-nav";
import {
  InsightsCard,
  InsightsCardSkeleton,
} from "@/components/insights-card";

const MONTHS = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

function formatRangeFromYMDs(startYMD: string, endYMD: string): string {
  const [, sm, sd] = startYMD.split("-").map(Number);
  const [, em, ed] = endYMD.split("-").map(Number);
  if (sm === em) {
    return `${sd}-${ed} ${MONTHS[sm - 1]}`;
  }
  return `${sd} ${MONTHS[sm - 1]} — ${ed} ${MONTHS[em - 1]}`;
}

export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const now = new Date();
  const { start: weekStart, end: weekEnd } = localWeekBoundsUTC(now, tz);
  // Sunday-local = day before weekEnd, computed via the Saturday probe.
  const sundayProbe = new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000);

  const blocks = await getBlocksForRange(supabase, user.id, weekStart, weekEnd);

  const rangeLabel = formatRangeFromYMDs(
    getYMDInTZ(weekStart, tz),
    getYMDInTZ(sundayProbe, tz),
  );

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 text-sm font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {rangeLabel}
          </div>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
              aria-label="вийти"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>вийти</span>
            </button>
          </form>
        </div>
        <div className="px-4 pb-4">
          <h1 className="text-3xl font-extrabold leading-tight">тиждень</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            те що склалось у ритм за 7 днів.
          </p>
        </div>
      </header>

      <div className="px-4 py-5 pb-32 flex flex-col gap-5">
        <SummaryTiles blocks={blocks} />
        <Suspense fallback={<InsightsCardSkeleton />}>
          <InsightsCard scope="week" />
        </Suspense>
        <WeeklyHeatmap blocks={blocks} weekStart={weekStart} tz={tz} />
        {blocks.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
            ще нема блоків за тиждень. почни на{" "}
            <a
              href="/today"
              className="text-primary font-bold underline underline-offset-2"
            >
              сьогодні
            </a>
            .
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
