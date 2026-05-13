import { CATEGORIES_BY_VALUE, type Category } from "@/lib/categories";
import type { Block } from "@/lib/db/blocks";

const BUCKET_HOURS = 4;
const BUCKETS_PER_DAY = 24 / BUCKET_HOURS; // 6
const BUCKET_MINUTES = BUCKET_HOURS * 60; // 240
const WEEKDAYS_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "нд"];

type BucketContent = {
  dominant: Category | null;
  totalMinutes: number;
};

function computeBucket(
  blocks: Block[],
  day: Date,
  bucketIdx: number,
): BucketContent {
  const bucketStart = new Date(day);
  bucketStart.setHours(bucketIdx * BUCKET_HOURS, 0, 0, 0);
  const bucketEnd = new Date(bucketStart);
  bucketEnd.setHours(bucketStart.getHours() + BUCKET_HOURS);

  const totals: Partial<Record<Category, number>> = {};
  for (const block of blocks) {
    const bs = new Date(block.start_at).getTime();
    const be = new Date(block.end_at).getTime();
    const overlap = Math.max(
      0,
      Math.min(be, bucketEnd.getTime()) - Math.max(bs, bucketStart.getTime()),
    );
    if (overlap <= 0) continue;
    const min = Math.round(overlap / 60_000);
    totals[block.category] = (totals[block.category] ?? 0) + min;
  }

  let dominant: Category | null = null;
  let maxMin = 0;
  let total = 0;
  for (const [cat, min] of Object.entries(totals) as [Category, number][]) {
    total += min;
    if (min > maxMin) {
      maxMin = min;
      dominant = cat;
    }
  }
  return { dominant, totalMinutes: total };
}

export function WeeklyHeatmap({
  blocks,
  weekStart,
}: {
  blocks: Block[];
  weekStart: Date; // Monday local
}) {
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <div className="bg-card border border-border rounded-3xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">ритм тижня</h2>
        <span className="text-xs text-muted-foreground tabular-nums">7×6</span>
      </div>

      {/* Day labels row */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, i) => (
          <div
            key={day.toISOString()}
            className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            {WEEKDAYS_SHORT[i]}
          </div>
        ))}
      </div>

      {/* Heatmap grid: 6 rows (buckets) × 7 cols (days) */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: BUCKETS_PER_DAY }, (_, bucketIdx) => (
          <div key={bucketIdx} className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const cell = computeBucket(blocks, day, bucketIdx);
              const meta = cell.dominant
                ? CATEGORIES_BY_VALUE[cell.dominant]
                : null;
              const intensity =
                cell.totalMinutes === 0
                  ? 0
                  : Math.max(0.3, Math.min(1, cell.totalMinutes / BUCKET_MINUTES));
              return (
                <div
                  key={day.toISOString()}
                  className="h-6 rounded-md border border-border/30"
                  style={{
                    backgroundColor: meta?.cssVar ?? "transparent",
                    opacity: meta ? intensity : 1,
                  }}
                  title={
                    meta
                      ? `${meta.label} · ${Math.round(cell.totalMinutes)}хв`
                      : "пусто"
                  }
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Bucket scale legend */}
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums px-0.5">
        <span>00-04</span>
        <span>04-08</span>
        <span>08-12</span>
        <span>12-16</span>
        <span>16-20</span>
        <span>20-24</span>
      </div>
    </div>
  );
}
