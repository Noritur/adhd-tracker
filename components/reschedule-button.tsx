"use client";

import { useActionState, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
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
  rescheduleAction,
  type RescheduleState,
} from "@/app/today/actions";

export function RescheduleButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    RescheduleState | null,
    FormData
  >(rescheduleAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const moved = state.moved ?? 0;
      const dropped = state.dropped ?? 0;
      if (moved > 0) {
        toast.success(
          `перекинув ${moved}${dropped > 0 ? `, не влізло ${dropped}` : ""}`,
          { description: state.note ?? undefined },
        );
        setOpen(false);
      } else {
        toast.message("нічого не переніс", {
          description:
            state.note ?? "на залишок дня чесно нічого не влазить",
        });
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
          className="w-full bg-card border border-border border-l-[3px] border-l-[var(--cat-rest)] rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-card/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-2xl bg-[var(--cat-rest)]/15 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-4 h-4 text-[var(--cat-rest)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--cat-rest)]">
              план зламався
            </span>
            <span className="text-sm font-semibold text-foreground">
              перекинь решту дня під реальність
            </span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>що сталось?</DialogTitle>
          <DialogDescription>
            незавершені блоки перекину на залишок дня від зараз — з паузами,
            без перевантажу. можеш не писати нічого.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <textarea
            name="text"
            rows={4}
            maxLength={1000}
            placeholder="проспав до 11, енергії мало. або: зустріч з'їла дві години."
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
              {isPending ? "перекидаю..." : "перекинути"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
