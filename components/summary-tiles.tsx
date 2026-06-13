import {
  Flame,
  Dumbbell,
  Sun,
  Users,
  Moon,
  House,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import type { Block } from "@/lib/db/blocks";
import type { Category } from "@/lib/categories";
import { formatDuration } from "@/lib/time/slots";

/**
 * Tile groups, in stable priority order. "фокус" merges the two productive
 * categories; everything else maps 1:1. A tile only renders if its blocks
 * sum to more than zero, so a day shows exactly the kinds of time it held —
 * no permanent zero tiles, and sport/chores/other are no longer invisible.
 */
const GROUPS: {
  key: string;
  cats: Category[];
  label: string;
  icon: LucideIcon;
  colorVar: string;
}[] = [
  { key: "focus", cats: ["coded", "work_other"], label: "фокус", icon: Flame, colorVar: "var(--cat-coded)" },
  { key: "sport", cats: ["sport"], label: "спорт", icon: Dumbbell, colorVar: "var(--cat-sport)" },
  { key: "outdoors", cats: ["outdoors"], label: "надвір", icon: Sun, colorVar: "var(--cat-outdoors)" },
  { key: "social", cats: ["social"], label: "люди", icon: Users, colorVar: "var(--cat-social)" },
  { key: "rest", cats: ["rest"], label: "відпочинок", icon: Moon, colorVar: "var(--cat-rest)" },
  { key: "chores", cats: ["chores"], label: "побут", icon: House, colorVar: "var(--cat-chores)" },
  { key: "other", cats: ["other"], label: "інше", icon: Shapes, colorVar: "var(--cat-other)" },
];

function sumMinutesByCategory(blocks: Block[], cats: Category[]): number {
  return blocks
    .filter((b) => cats.includes(b.category))
    .reduce(
      (acc, b) =>
        acc +
        (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) /
          60_000,
      0,
    );
}

export function SummaryTiles({ blocks }: { blocks: Block[] }) {
  const tiles = GROUPS.map((g) => ({
    ...g,
    minutes: sumMinutesByCategory(blocks, g.cats),
  }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  if (tiles.length === 0) return null;

  // One kind of time → full-width tile; otherwise a two-column grid.
  const cols = tiles.length === 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <div className={`grid ${cols} gap-3`}>
      {tiles.map((t) => (
        <Tile
          key={t.key}
          icon={t.icon}
          label={t.label}
          value={formatDuration(t.minutes)}
          colorVar={t.colorVar}
        />
      ))}
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
    <div className="glass-light rounded-3xl p-4 flex flex-col gap-1">
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
