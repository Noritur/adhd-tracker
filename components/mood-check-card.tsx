import { createClient } from "@/lib/supabase/server";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { getBlocksForDate } from "@/lib/db/blocks";
import { CATEGORIES_BY_VALUE } from "@/lib/categories";
import { getHHMMInTZ } from "@/lib/time/tz";
import { MoodRow } from "@/components/mood-row";

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
    <div className="glass-light rounded-3xl p-4 flex flex-col gap-3">
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
            <MoodRow
              key={b.id}
              blockId={b.id}
              title={title}
              meta={`${start} · ${cat?.label}`}
            />
          );
        })}
      </div>
    </div>
  );
}
