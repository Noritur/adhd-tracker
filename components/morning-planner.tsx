"use client";

import { useActionState, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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
  generatePlanAction,
  type GeneratePlanState,
} from "@/app/today/actions";

export function MorningPlanner() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    GeneratePlanState | null,
    FormData
  >(generatePlanAction, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      const created = state.created ?? 0;
      const skipped = state.skipped ?? 0;
      if (created > 0) {
        toast.success(
          `створено ${created}${skipped > 0 ? `, пропущено ${skipped}` : ""}`,
          { description: state.note ?? undefined },
        );
        setOpen(false);
      } else {
        toast.message("нічого не створив", {
          description:
            state.note ?? "AI не знайшов вільних слотів — звільни час або переформулюй",
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
          className="w-full bg-card border border-border border-l-[3px] border-l-[var(--accent-warm)] rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-card/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--accent-warm)]">
              план дня
            </span>
            <span className="text-sm font-semibold text-foreground">
              скажи що треба — докину блоки у вільні слоти
            </span>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>що сьогодні треба?</DialogTitle>
          <DialogDescription>
            опиши коротко — задачі, прогулянка, відпочинок. AI розкине по часу
            без перекриття з існуючими блоками.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <textarea
            name="text"
            rows={6}
            required
            maxLength={2000}
            placeholder="дві години фокусу зранку на нову фічу. потім година на побут. ввечері — спорт і прогулянка з собакою."
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
              {isPending ? "думаю..." : "побудувати"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
