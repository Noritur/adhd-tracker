"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveBlockAction,
  deleteBlockAction,
  type SaveBlockState,
} from "@/app/today/actions";
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  type Category,
} from "@/lib/categories";
import {
  formatTime,
  minutesToISOInTZ,
  timeStringToMin,
} from "@/lib/time/slots";

export type EditingBlock = {
  id?: number;
  startMin: number;
  endMin: number;
  category: Category;
  label: string;
};

export function BlockEditSheet({
  editing,
  ymd,
  tz,
  onClose,
}: {
  editing: EditingBlock | null;
  /** Local YMD of the day being edited. */
  ymd: string;
  /** Profile timezone — drives the hidden ISO conversion. */
  tz: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [startMin, setStartMin] = useState(540);
  const [endMin, setEndMin] = useState(600);
  const [label, setLabel] = useState("");
  const [deletePending, startDeleteTransition] = useTransition();

  const [state, formAction, savePending] = useActionState<
    SaveBlockState | null,
    FormData
  >(async (prev, formData) => {
    const result = await saveBlockAction(prev, formData);
    if (!result.error) onClose();
    return result;
  }, null);

  // Sync local form state when a new editing target opens.
  useEffect(() => {
    if (editing) {
      setCategory(editing.category);
      setStartMin(editing.startMin);
      setEndMin(editing.endMin);
      setLabel(editing.label);
    }
  }, [editing]);

  const open = editing !== null;
  const isEditing = editing?.id !== undefined;

  const onDelete = () => {
    if (!editing?.id) return;
    startDeleteTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(editing.id));
      await deleteBlockAction(fd);
      onClose();
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="glass-chrome border-0 rounded-t-3xl px-5 pb-6 max-h-[90vh] overflow-y-auto"
      >
        <SheetHeader className="px-0">
          <SheetTitle className="text-2xl font-extrabold">
            {isEditing ? "редагувати блок" : "новий блок"}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            час, назва, категорія
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-col gap-5 mt-5">
          {/* Hidden fields built from local state, ISO in profile TZ. */}
          <input
            type="hidden"
            name="start_at"
            value={minutesToISOInTZ(ymd, startMin, tz)}
          />
          <input
            type="hidden"
            name="end_at"
            value={minutesToISOInTZ(ymd, endMin, tz)}
          />
          <input type="hidden" name="category" value={category} />
          {editing?.id ? (
            <input type="hidden" name="id" value={editing.id} />
          ) : null}

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <TimeField
              label="початок"
              minutes={startMin}
              onChange={setStartMin}
              colorVar={`var(--cat-coded)`}
            />
            <TimeField
              label="кінець"
              minutes={endMin}
              onChange={setEndMin}
              colorVar={`var(--cat-outdoors)`}
            />
          </div>

          {/* Label */}
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              назва
            </span>
            <Input
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="що робив"
              className="h-12 rounded-2xl glass-light border-0"
            />
          </div>

          {/* Category grid 4×2 */}
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              категорія
            </span>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => {
                const active = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-2xl text-[11px] font-bold transition-colors ${
                      active
                        ? "bg-primary/15 text-foreground ring-1 ring-primary"
                        : "glass-light text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.cssVar }}
                    />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {state?.error && (
            <p className="text-sm text-destructive text-center">
              {state.error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-1">
            {isEditing && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deletePending}
                className="flex items-center gap-1 px-4 h-12 rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive font-bold text-sm disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deletePending ? "..." : "видалити"}
              </button>
            )}
            <Button
              type="submit"
              disabled={savePending}
              className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground glow-primary font-bold"
            >
              {savePending ? "..." : "зберегти"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TimeField({
  label,
  minutes,
  onChange,
  colorVar,
}: {
  label: string;
  minutes: number;
  onChange: (m: number) => void;
  colorVar: string;
}) {
  return (
    <label className="flex flex-col gap-1 glass-light rounded-2xl p-3 cursor-pointer">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: colorVar }}
        />
        {label}
      </span>
      <input
        type="time"
        value={formatTime(minutes)}
        onChange={(e) => onChange(timeStringToMin(e.target.value))}
        className="text-2xl font-extrabold bg-transparent border-0 p-0 h-auto tabular-nums text-foreground focus:outline-none"
      />
    </label>
  );
}
