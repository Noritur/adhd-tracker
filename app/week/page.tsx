import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForRange } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import {
  getYMDInTZ,
  localWeekBoundsUTC,
  localMidnightUTC,
} from "@/lib/time/tz";
import { SummaryTiles } from "@/components/summary-tiles";
import { WeeklyHeatmap } from "@/components/weekly-heatmap";
import { BottomNav } from "@/components/bottom-nav";
import {
  InsightsCard,
  InsightsCardSkeleton,
} from "@/components/insights-card";
import { WeekNav } from "@/components/week-nav";
import { WeekWord } from "@/components/week-word";
import { getWeekWord } from "@/lib/db/week-words";
import { getWeekdayInTZ } from "@/lib/time/tz";

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

/** Parse "YYYY-MM-DD" into a UTC Date, or null if invalid. */
function parseYMD(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

/** Shift a YYYY-MM-DD by N days. */
function shiftYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function WeekPage({ searchParams }: Props) {
  const sp = await searchParams;
  const weekParam = typeof sp.week === "string" ? sp.week : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const now = new Date();

  // Determine which week to show.
  const targetDate = parseYMD(weekParam) ?? now;
  const { start: weekStart, end: weekEnd } = localWeekBoundsUTC(targetDate, tz);

  // Current week bounds for comparison.
  const { start: currentWeekStart } = localWeekBoundsUTC(now, tz);
  const isCurrentWeek =
    getYMDInTZ(weekStart, tz) === getYMDInTZ(currentWeekStart, tz);

  // Is this a future week? (weekStart > currentWeekStart)
  const isFutureWeek = weekStart.getTime() > currentWeekStart.getTime();

  // Sunday = day before weekEnd.
  const sundayProbe = new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000);

  const blocks = await getBlocksForRange(supabase, user.id, weekStart, weekEnd);

  const mondayYMD = getYMDInTZ(weekStart, tz);
  const sundayYMD = getYMDInTZ(sundayProbe, tz);
  const rangeLabel = formatRangeFromYMDs(mondayYMD, sundayYMD);

  // Navigation links.
  const prevWeekYMD = shiftYMD(mondayYMD, -7);
  const nextWeekYMD = shiftYMD(mondayYMD, 7);

  // Word of the week.
  const weekWord = await getWeekWord(supabase, user.id, mondayYMD);
  // Show input prompt: current week after Thursday, or past week without word.
  const todayWeekday = getWeekdayInTZ(now, tz); // 0=Sun..6=Sat
  const isLateInWeek =
    isCurrentWeek && (todayWeekday === 5 || todayWeekday === 6 || todayWeekday === 0);
  // Thu=4, Fri=5, Sat=6, Sun=0
  const showWordPrompt =
    (!weekWord && isLateInWeek) || (!weekWord && !isCurrentWeek && !isFutureWeek);

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border/40">
        <div className="px-4 py-3">
          <WeekNav
            rangeLabel={rangeLabel}
            prevHref={`/week?week=${prevWeekYMD}`}
            nextHref={isFutureWeek ? null : `/week?week=${nextWeekYMD}`}
            todayHref={isCurrentWeek ? null : "/week"}
            isCurrentWeek={isCurrentWeek}
          />
        </div>
        <div className="px-4 pb-4">
          <h1 className="text-3xl font-extrabold leading-tight">тиждень</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {isCurrentWeek
              ? "те що склалось у ритм за 7 днів."
              : "архів тижня. тільки перегляд."}
          </p>
        </div>
      </header>

      <div className="px-4 py-5 pb-32 flex flex-col gap-5">
        <WeekWord
          weekStart={mondayYMD}
          existingWord={weekWord?.word ?? null}
          showPrompt={showWordPrompt}
        />
        <SummaryTiles blocks={blocks} />
        <Suspense fallback={<InsightsCardSkeleton />}>
          <InsightsCard scope="week" />
        </Suspense>
        <WeeklyHeatmap blocks={blocks} weekStart={weekStart} tz={tz} />
        {blocks.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
            {isCurrentWeek ? (
              <>
                ще нема блоків за тиждень. почни на{" "}
                <a
                  href="/today"
                  className="text-primary font-bold underline underline-offset-2"
                >
                  сьогодні
                </a>
                .
              </>
            ) : (
              "цей тиждень порожній."
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
