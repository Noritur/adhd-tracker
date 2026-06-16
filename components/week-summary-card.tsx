import { CalendarDays } from "lucide-react";

/**
 * Read-only weekly digest card. Presentational — the page fetches the
 * summary (same pattern as WeekWord) and passes it in. Renders nothing
 * when the week has no summary yet.
 */
export function WeekSummaryCard({ summary }: { summary: string | null }) {
  if (!summary) return null;

  return (
    <div className="glass-light rounded-3xl p-4 flex gap-3 items-start">
      <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <CalendarDays className="w-4 h-4 text-primary" />
      </div>
      <div className="flex flex-col gap-2 min-w-0 w-full">
        <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
          підсумок тижня
        </span>
        <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">
          {summary}
        </p>
      </div>
    </div>
  );
}
