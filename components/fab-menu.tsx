"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { MorningPlanner } from "@/components/morning-planner";
import { RescheduleButton } from "@/components/reschedule-button";
import { RebuildButton } from "@/components/rebuild-button";

export function FabMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-background/70"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      {/* Pills stay mounted so their dialogs survive the menu closing;
          a captured click closes the menu while the dialog opens. */}
      <div
        className={`fixed right-4 bottom-40 z-50 flex flex-col items-end gap-2.5 transition-all duration-200 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none"
        }`}
        onClickCapture={() => setOpen(false)}
      >
        <MorningPlanner />
        <RescheduleButton />
        <RebuildButton />
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "закрити меню" : "AI-дії з днем"}
        aria-expanded={open}
        className={`fixed right-4 bottom-[5.5rem] z-50 w-14 h-14 rounded-full flex items-center justify-center transition-colors active:scale-95 ${
          open
            ? "glass-chrome text-foreground"
            : "bg-primary text-primary-foreground glow-primary"
        }`}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>
    </>
  );
}
