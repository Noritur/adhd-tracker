"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  submitWeekReflectionAction,
  type WeekReflectionState,
} from "@/app/week/actions";

type Props = {
  weekStart: string; // YYYY-MM-DD Monday
  summary: string | null; // coach's thoughts on the week (week_summaries.summary)
  note: string | null; // my reflection input
  advice: string | null; // coach advice generated from note + memory
};

export function WeekReflection({ weekStart, summary, note, advice }: Props) {
  const [state, formAction, isPending] = useActionState<
    WeekReflectionState | null,
    FormData
  >(submitWeekReflectionAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("коуч відповів");
    else if (state.error) toast.error(state.error);
  }, [state]);

  // No coach summary for this week yet → nothing to reflect on.
  if (!summary) return null;

  // Already reflected → show my note + coach advice.
  if (note && advice) {
    return (
      <div className="glass-light rounded-3xl p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            мій стан за тиждень
          </span>
          <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">
            {note}
          </p>
        </div>
        <div className="flex flex-col gap-1 pt-2 border-t border-border/40">
          <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
            поради коуча
          </span>
          <p className="text-sm text-[var(--text-secondary)] leading-snug whitespace-pre-wrap">
            {advice}
          </p>
        </div>
      </div>
    );
  }

  // Have coach summary, no note yet → reflection input.
  return (
    <form
      action={formAction}
      className="glass-light rounded-3xl p-4 flex flex-col gap-3 border-l-[3px] border-l-primary"
    >
      <input type="hidden" name="week_start" value={weekStart} />
      <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
        твій тиждень
      </span>
      <p className="text-sm text-muted-foreground">
        розкажи коучу свій стан за тиждень — він згадає минулі тижні й дасть
        поради.
      </p>
      <textarea
        name="note"
        rows={4}
        maxLength={2000}
        placeholder="як пройшов тиждень? настрій, енергія, що далось / де застряг…"
        disabled={isPending}
        className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="self-end px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
      >
        {isPending ? "коуч думає…" : "надіслати"}
      </button>
    </form>
  );
}
