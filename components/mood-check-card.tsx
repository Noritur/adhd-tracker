import { createClient } from "@/lib/supabase/server";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { getBlocksForDate } from "@/lib/db/blocks";
import { CATEGORIES_BY_VALUE } from "@/lib/categories";
import { getHHMMInTZ } from "@/lib/time/tz";
import { setBlockMoodAction } from "@/app/today/actions";

const MOODS: { value: "fire" | "ok" | "swamp"; emoji: string; label: string }[] =
  [
    { value: "fire", emoji: "🔥", label: "вогонь" },
    { value: "ok", emoji: "😐", label: "норм" },
    { value: "swamp", emoji: "🫠", label: "болото" },
  ];

export async function MoodCheckCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  // Server Component renders per-request; capturing "now" once is the
  // correct pattern even though Date.now is impure in React's strict sense.
  // biome-ignore lint/correctness/noUnusedVariables: used below
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const blocks = await getBlocksForDate(supabase, user.id, new Date(now), tz);

  // Past blocks (already ended) still missing a mood rating.
  const pending = blocks.filter(
    (b) => new Date(b.end_at).getTime() < now && b.mood === null,
  );
  if (pending.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 border-l-[3px] border-l-[var(--accent-warm)]">
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--accent-warm)]">
          як пройшло
        </span>
        <span className="text-sm text-muted-foreground">
          швидко познач — коуч побачить твій ритм енергії
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {pending.map((b) => {
          const cat = CATEGORIES_BY_VALUE[b.category];
          const start = getHHMMInTZ(new Date(b.start_at), tz);
          const title = b.label?.trim() || cat?.label || "блок";
          return (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 bg-background/40 rounded-xl p-2.5"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{title}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {start} · {cat?.label}
                </span>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {MOODS.map((m) => (
                  <form key={m.value} action={setBlockMoodAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="mood" value={m.value} />
                    <button
                      type="submit"
                      aria-label={m.label}
                      title={m.label}
                      className="w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-base flex items-center justify-center transition-colors active:scale-90"
                    >
                      {m.emoji}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
