import type { Block } from "@/lib/db/blocks";
import { getCategoryMeta } from "@/lib/categories";
import { getHHMMInTZ } from "@/lib/time/tz";

const MOOD_EMOJI: Record<string, string> = {
  fire: "\u{1F525}",
  ok: "\u{1F44D}",
  swamp: "\u{1F32B}\u{FE0F}",
};

function durationLabel(startISO: string, endISO: string): string {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}

export function DayTimeline({ blocks, tz }: { blocks: Block[]; tz: string }) {
  if (blocks.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          блоки дня
        </p>
      </div>
      <div className="divide-y divide-border/40">
        {blocks.map((block) => {
          const cat = getCategoryMeta(block.category);
          const mood = block.mood ? MOOD_EMOJI[block.mood] : null;
          return (
            <div key={block.id} className="flex items-stretch">
              <div
                className="w-1 flex-shrink-0"
                style={{ backgroundColor: cat.cssVar }}
              />
              <div className="flex-1 px-4 py-3 flex items-center gap-3">
                <div className="flex flex-col items-center text-xs text-muted-foreground font-mono w-14 flex-shrink-0">
                  <span>{getHHMMInTZ(new Date(block.start_at), tz)}</span>
                  <span className="text-[10px]">
                    {durationLabel(block.start_at, block.end_at)}
                  </span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {block.label ?? cat.label}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: cat.cssVar }}
                  >
                    {cat.label}
                  </span>
                </div>
                {mood && (
                  <span className="text-lg flex-shrink-0">{mood}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
