"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  setWeekWordAction,
  type SetWeekWordState,
} from "@/app/week/actions";

type Props = {
  weekStart: string; // YYYY-MM-DD Monday
  existingWord: string | null;
  /** Show the input prompt (current or recent week without word). */
  showPrompt: boolean;
};

export function WeekWord({ weekStart, existingWord, showPrompt }: Props) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState<
    SetWeekWordState | null,
    FormData
  >(setWeekWordAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      setEditing(false);
      toast.success("збережено");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // Existing word — show as hero anchor.
  if (existingWord && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full bg-card border border-border rounded-2xl p-6 text-center hover:bg-card/60 transition-colors"
      >
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
          слово тижня
        </p>
        <p className="text-2xl font-extrabold text-foreground leading-tight">
          {existingWord}
        </p>
      </button>
    );
  }

  // Input mode — either editing existing or new prompt.
  if (editing || (showPrompt && !existingWord)) {
    return (
      <form
        action={formAction}
        className="w-full bg-card border border-border border-l-[3px] border-l-primary rounded-2xl p-4 flex flex-col gap-3"
      >
        <input type="hidden" name="week_start" value={weekStart} />
        <p className="text-[10px] uppercase tracking-wider font-bold text-primary">
          слово тижня
        </p>
        <p className="text-sm text-muted-foreground">
          одне слово або фраза — якорь для пам'яті. шо це був за тиждень?
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            name="word"
            type="text"
            maxLength={100}
            defaultValue={existingWord ?? ""}
            placeholder="наприклад: перший деплой"
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            disabled={isPending}
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "..." : "ok"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-2 text-sm text-muted-foreground"
            >
              скас
            </button>
          )}
        </div>
      </form>
    );
  }

  // No word, no prompt — show nothing.
  return null;
}
