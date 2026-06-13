"use client";

import { useActionState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  retroFillAction,
  type RetroFillState,
} from "@/app/day/[date]/actions";

type Props = {
  ymd: string;
  hasBlocks: boolean;
};

export function RetroFillCard({ ymd, hasBlocks }: Props) {
  const [state, formAction, isPending] = useActionState<
    RetroFillState | null,
    FormData
  >(retroFillAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const created = state.created ?? 0;
      if (created > 0) {
        toast.success(`створив ${created} блоків`, {
          description: state.note ?? undefined,
        });
      } else {
        toast.message("не вдалось створити блоки", {
          description: state.note ?? "спробуй описати день інакше",
        });
      }
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  if (hasBlocks) return null;

  return (
    <form
      action={formAction}
      className="w-full glass-light rounded-3xl p-4 flex flex-col gap-3"
    >
      <input type="hidden" name="ymd" value={ymd} />
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-[var(--cat-social)]/15 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-[var(--cat-social)]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--cat-social)]">
            заповнити постфактум
          </span>
          <span className="text-sm font-semibold text-foreground">
            опиши день — AI розкладе по блокам
          </span>
        </div>
      </div>
      <textarea
        name="text"
        rows={5}
        required
        maxLength={2000}
        placeholder="з ранку працював до обіду, потім гуляв, ввечері спорт і серіал"
        className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        disabled={isPending}
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? "думаю..." : "заповнити"}
        </button>
      </div>
    </form>
  );
}
