"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  rangeLabel: string;
  prevHref: string;
  nextHref: string | null; // null = disabled (future)
  todayHref: string | null; // null = already current week
  isCurrentWeek: boolean;
};

export function WeekNav({
  rangeLabel,
  prevHref,
  nextHref,
  todayHref,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={prevHref}
        className="flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border hover:bg-card/60 transition-colors"
        aria-label="попередній тиждень"
      >
        <ChevronLeft className="w-4 h-4" />
      </Link>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5 text-sm font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {rangeLabel}
        </div>
        {todayHref && (
          <Link
            href={todayHref}
            className="bg-primary/10 text-primary text-xs font-bold rounded-full px-2.5 py-1 hover:bg-primary/20 transition-colors"
          >
            зараз
          </Link>
        )}
      </div>

      {nextHref ? (
        <Link
          href={nextHref}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border hover:bg-card/60 transition-colors"
          aria-label="наступний тиждень"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <div className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center opacity-30">
          <ChevronRight className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
