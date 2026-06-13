import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForDate } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { getYMDInTZ } from "@/lib/time/tz";
import { TimelineDay } from "@/components/timeline/timeline-day";
import { BottomNav } from "@/components/bottom-nav";
import {
  InsightsCard,
  InsightsCardSkeleton,
} from "@/components/insights-card";
import { EveningReviewCard } from "@/components/evening-review-card";
import { MoodCheckCard } from "@/components/mood-check-card";
import { FabMenu } from "@/components/fab-menu";

const WEEKDAYS = [
  "неділя",
  "понеділок",
  "вівторок",
  "середа",
  "четвер",
  "п'ятниця",
  "субота",
];
const WEEKDAYS_SHORT = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
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

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const today = new Date();
  const blocks = await getBlocksForDate(supabase, user.id, today, tz);

  const ymdInTZ = getYMDInTZ(today, tz);
  const [y, m, d] = ymdInTZ.split("-").map(Number);
  const weekdayIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dateLabel = `${WEEKDAYS_SHORT[weekdayIdx]}, ${d} ${MONTHS[m - 1]}`;
  void WEEKDAYS; // reserved for full-name use later

  return (
    <main className="min-h-screen flex flex-col">
      <div aria-hidden className="aurora-bg fixed inset-0 -z-10 pointer-events-none" />
      {/* Sticky header */}
      <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top)] glass-chrome rounded-b-3xl">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 text-sm font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {dateLabel}
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
          <h1 className="text-3xl font-extrabold leading-tight">сьогодні</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            м'який план без геройства. просто наступний блок.
          </p>
        </div>
      </header>

      <div className="px-4 py-5 pb-40 flex flex-col gap-5">
        <EveningReviewCard />
        <MoodCheckCard />
        <Suspense fallback={<InsightsCardSkeleton />}>
          <InsightsCard scope="today" />
        </Suspense>
        <TimelineDay
          initialBlocks={blocks}
          ymd={ymdInTZ}
          tz={tz}
        />
      </div>

      <BottomNav />
      <FabMenu />
    </main>
  );
}
