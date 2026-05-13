import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForDate } from "@/lib/db/blocks";
import { TimelineDay } from "@/components/timeline/timeline-day";
import { SummaryTiles } from "@/components/summary-tiles";
import { BottomNav } from "@/components/bottom-nav";

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

  const today = new Date();
  const blocks = await getBlocksForDate(supabase, user.id, today);

  const dateLabel = `${WEEKDAYS_SHORT[today.getDay()]}, ${today.getDate()} ${MONTHS[today.getMonth()]}`;
  void WEEKDAYS; // reserved for full-name use later

  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border/40">
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

      <div className="px-4 py-5 pb-32 flex flex-col gap-5">
        <SummaryTiles blocks={blocks} />
        <TimelineDay
          initialBlocks={blocks}
          dateISO={today.toISOString()}
        />
      </div>

      <BottomNav />
    </main>
  );
}
