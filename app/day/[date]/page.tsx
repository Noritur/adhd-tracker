import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForDate } from "@/lib/db/blocks";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import {
  getYMDInTZ,
  getWeekdayInTZ,
  isValidYMD,
  ymdToProbeUTC,
} from "@/lib/time/tz";
import { SummaryTiles } from "@/components/summary-tiles";
import { BottomNav } from "@/components/bottom-nav";
import { RetroFillCard } from "@/components/retro-fill-card";
import { DayTimeline } from "@/components/day-timeline";

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

type Props = {
  params: Promise<{ date: string }>;
};

export default async function DayPage({ params }: Props) {
  const { date } = await params;
  // Fast format/calendar check before auth so 404 stays cheap.
  if (!isValidYMD(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);

  // Now that we have tz, materialize the date into a UTC probe that
  // actually lands inside the user's local day (noon-local). Previous
  // version used UTC midnight which is the PREVIOUS local day for every
  // negative-offset timezone — including NY/LA/Chicago/Mexico/Sao_Paulo
  // that the settings form actually offers.
  const targetDate = ymdToProbeUTC(date, tz);
  if (!targetDate) notFound();

  // If this is today, redirect to /today.
  const todayYMD = getYMDInTZ(new Date(), tz);
  if (date === todayYMD) redirect("/today");

  // Future date → also redirect. String comparison on YYYY-MM-DD is
  // lexicographic = chronological for ISO dates.
  if (date >= todayYMD) redirect("/today");

  const blocks = await getBlocksForDate(supabase, user.id, targetDate, tz);

  // Local weekday + day-of-month derived from the user-tz probe, not
  // raw `getUTCDay()` which would be wrong by ±1 day in negative TZ.
  const weekdayIdx = getWeekdayInTZ(targetDate, tz);
  const [, m, d] = date.split("-").map(Number);
  const dateLabel = `${WEEKDAYS_SHORT[weekdayIdx]}, ${d} ${MONTHS[m - 1]}`;

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border/40">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/week"
            className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            тиждень
          </Link>
          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 text-sm font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            {dateLabel}
          </div>
        </div>
        <div className="px-4 pb-4">
          <h1 className="text-3xl font-extrabold leading-tight">
            {d} {MONTHS[m - 1]}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {blocks.length > 0
              ? "архів дня. тільки перегляд."
              : "порожній день. можеш заповнити постфактум."}
          </p>
        </div>
      </header>

      <div className="px-4 py-5 pb-32 flex flex-col gap-5">
        <RetroFillCard ymd={date} hasBlocks={blocks.length > 0} />
        {blocks.length > 0 && (
          <>
            <SummaryTiles blocks={blocks} />
            <DayTimeline blocks={blocks} tz={tz} />
          </>
        )}
        {blocks.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
            нема блоків за цей день.
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
