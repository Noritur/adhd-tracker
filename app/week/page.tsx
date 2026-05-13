import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBlocksForRange } from "@/lib/db/blocks";
import { SummaryTiles } from "@/components/summary-tiles";
import { WeeklyHeatmap } from "@/components/weekly-heatmap";
import { BottomNav } from "@/components/bottom-nav";

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

/** Get Monday of the current week in local time. */
function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatRange(start: Date, end: Date): string {
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = MONTHS[start.getMonth()];
  const endMonth = MONTHS[end.getMonth()];
  if (start.getMonth() === end.getMonth()) {
    return `${startDay}-${endDay} ${startMonth}`;
  }
  return `${startDay} ${startMonth} — ${endDay} ${endMonth}`;
}

export default async function WeekPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const now = new Date();
  const monday = getMondayOfWeek(now);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekEndExclusive = new Date(monday);
  weekEndExclusive.setDate(monday.getDate() + 7);

  const blocks = await getBlocksForRange(
    supabase,
    user.id,
    monday,
    weekEndExclusive,
  );

  const rangeLabel = formatRange(monday, sunday);

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
        <WeeklyHeatmap blocks={blocks} weekStart={monday} />
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
