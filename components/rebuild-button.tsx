"use client";

import { useActionState, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  rebuildDayAction,
  type RebuildDayState,
} from "@/app/today/actions";

export function RebuildButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    RebuildDayState | null,
    FormData
  >(rebuildDayAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const created = state.created ?? 0;
      const deleted = state.deleted ?? 0;
      if (created > 0) {
        toast.success(
          `видалив ${deleted}, створив ${created} нових`,
          { description: state.note ?? undefined },
        );
        setOpen(false);
      } else {
        toast.message(
          deleted > 0 ? `очистив ${deleted} блоків` : "нема що прибирати",
          {
            description:
              state.note ?? "спробуй описати день інакше",
          },
        );
      }
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full bg-card border border-border border-l-[3px] border-l-[var(--cat-outdoors)] rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-card/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-2xl bg-[var(--cat-outdoors)]/15 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-4 h-4 text-[var(--cat-outdoors)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--cat-outdoors)]">
              перебудувати день
            </span>
            <span className="text-sm font-semibold text-foreground">
              забудь план — новий день від зараз
            </span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>перебудувати день</DialogTitle>
          <DialogDescription>
            видалю все що ще не почалось і побудую новий план з нуля.
            минулі блоки залишаться.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <textarea
            name="text"
            rows={6}
            required
            maxLength={2000}
            placeholder="пів дня пропало. залишилось: фокус 2 год, прогулянка, вечірній спорт. дай реалістично."
            className="w-full bg-card border border-border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            disabled={isPending}
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-muted-foreground"
                disabled={isPending}
              >
                скасувати
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              {isPending ? "перебудовую..." : "перебудувати"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
