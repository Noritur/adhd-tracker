import { Flame, Sun, Users, Moon, type LucideIcon } from "lucide-react";
import type { Block } from "@/lib/db/blocks";
import type { Category } from "@/lib/categories";
import { formatDuration, isoToLocalDayMinutes } from "@/lib/time/slots";

function sumMinutesByCategory(
  blocks: Block[],
  cats: Category[],
): number {
  return blocks
    .filter((b) => cats.includes(b.category))
    .reduce(
      (acc, b) =>
        acc + (isoToLocalDayMinutes(b.end_at) - isoToLocalDayMinutes(b.start_at)),
      0,
    );
}

export function SummaryTiles({ blocks }: { blocks: Block[] }) {
  const focusMin = sumMinutesByCategory(blocks, ["coded", "work_other"]);
  const outdoorsMin = sumMinutesByCategory(blocks, ["outdoors"]);
  const socialMin = sumMinutesByCategory(blocks, ["social"]);
  const restMin = sumMinutesByCategory(blocks, ["rest"]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        icon={Flame}
        label="фокус"
        value={formatDuration(focusMin)}
        colorVar="var(--cat-coded)"
      />
      <Tile
        icon={Sun}
        label="надвір"
        value={formatDuration(outdoorsMin)}
        colorVar="var(--cat-outdoors)"
      />
      <Tile
        icon={Users}
        label="люди"
        value={formatDuration(socialMin)}
        colorVar="var(--cat-social)"
      />
      <Tile
        icon={Moon}
        label="відпочинок"
        value={formatDuration(restMin)}
        colorVar="var(--cat-rest)"
      />
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  colorVar,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  colorVar: string;
}) {
  return (
    <div
      className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-1 border-l-[3px]"
      style={{ borderLeftColor: colorVar }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: colorVar }} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
      </div>
      <div className="text-2xl font-extrabold tabular-nums leading-tight">
        {value}
      </div>
    </div>
  );
}
