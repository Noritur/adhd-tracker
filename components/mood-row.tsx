"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { setBlockMoodAction } from "@/app/today/actions";

const MOODS: { value: "fire" | "ok" | "swamp"; emoji: string; label: string }[] =
  [
    { value: "fire", emoji: "🔥", label: "вогонь" },
    { value: "ok", emoji: "😐", label: "норм" },
    { value: "swamp", emoji: "🫠", label: "болото" },
  ];

type Mood = (typeof MOODS)[number]["value"];

export function MoodRow({
  blockId,
  title,
  meta,
}: {
  blockId: number;
  title: string;
  meta: string;
}) {
  const [selected, setSelected] = useState<Mood | null>(null);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  const pick = (mood: Mood) => {
    if (selected) return;
    setSelected(mood);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", String(blockId));
        fd.set("mood", mood);
        await setBlockMoodAction(fd);
        setSaved(true);
      } catch {
        setSelected(null);
        toast.error("не вдалось зберегти, спробуй ще раз");
      }
    });
  };

  return (
    <div
      className={`flex items-center justify-between gap-2 bg-background/40 rounded-xl p-2.5 transition-opacity duration-300 ${
        saved ? "opacity-50" : ""
      }`}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold truncate">{title}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {meta}
        </span>
      </div>
      {saved ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-primary flex-shrink-0">
          <Check className="w-3.5 h-3.5" />
          записав
        </span>
      ) : (
        <div className="flex gap-1 flex-shrink-0">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => pick(m.value)}
              disabled={selected !== null}
              aria-label={m.label}
              title={m.label}
              className={`w-9 h-9 rounded-full text-base flex items-center justify-center transition-all active:scale-90 ${
                selected === m.value
                  ? "bg-primary/15 ring-2 ring-primary"
                  : selected
                    ? "bg-muted/60 opacity-40"
                    : "bg-muted/60 hover:bg-muted"
              }`}
            >
              {m.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
