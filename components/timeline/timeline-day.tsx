"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  BlockEditSheet,
  type EditingBlock,
} from "@/components/block-edit-sheet";
import {
  CATEGORIES_BY_VALUE,
  DEFAULT_CATEGORY,
  type Category,
} from "@/lib/categories";
import {
  DAY_MINUTES,
  MIN_BLOCK_MIN,
  PX_PER_MIN,
  SNAP_MIN,
  clampMin,
  formatTime,
  isoToLocalDayMinutes,
  snap,
} from "@/lib/time/slots";
import type { Block } from "@/lib/db/blocks";

export function TimelineDay({
  initialBlocks,
  dateISO,
}: {
  initialBlocks: Block[];
  dateISO: string;
}) {
  const [editing, setEditing] = useState<EditingBlock | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const openCreateAtY = (clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const rawMin = Math.round(y / PX_PER_MIN);
    const startMin = clampMin(snap(rawMin));
    const endMin = clampMin(startMin + 60);
    setEditing({
      startMin,
      endMin,
      category: DEFAULT_CATEGORY,
      label: "",
    });
  };

  const onGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    openCreateAtY(e.clientY);
  };

  const openCreateNow = () => {
    const now = new Date();
    const min = clampMin(snap(now.getHours() * 60 + now.getMinutes()));
    const startMin = clampMin(min - 30);
    const endMin = clampMin(min + 30);
    setEditing({
      startMin,
      endMin,
      category: DEFAULT_CATEGORY,
      label: "",
    });
  };

  return (
    <>
      <div className="relative">
        <div
          ref={containerRef}
          onClick={onGridClick}
          className="relative bg-card rounded-3xl border border-border overflow-hidden cursor-pointer"
          style={{ height: `${DAY_MINUTES * PX_PER_MIN}px` }}
        >
          {/* Hour ticks */}
          {Array.from({ length: 25 }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex items-center pointer-events-none"
              style={{ top: `${i * 60 * PX_PER_MIN}px` }}
            >
              <span className="w-14 pl-3 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {i.toString().padStart(2, "0")}:00
              </span>
              <div className="flex-1 border-t border-border/40" />
            </div>
          ))}

          {/* Half-hour subticks */}
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={`half-${i}`}
              className="absolute left-14 right-0 border-t border-border/15 pointer-events-none"
              style={{ top: `${(i * 60 + 30) * PX_PER_MIN}px` }}
            />
          ))}

          {/* Now line */}
          <NowLine />

          {/* Blocks */}
          {initialBlocks.map((block) => (
            <BlockChip
              key={block.id}
              block={block}
              onClick={() =>
                setEditing({
                  id: block.id,
                  startMin: isoToLocalDayMinutes(block.start_at),
                  endMin: isoToLocalDayMinutes(block.end_at),
                  category: block.category,
                  label: block.label ?? "",
                })
              }
            />
          ))}

          {/* Empty state hint (only when no blocks) */}
          {initialBlocks.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm text-muted-foreground">
                тапни будь-де щоб додати блок
              </span>
            </div>
          )}
        </div>

        {/* FAB — opens "now" block */}
        <button
          type="button"
          onClick={openCreateNow}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-2xl shadow-primary/30 active:scale-95 transition-transform z-30"
          aria-label="новий блок зараз"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      <BlockEditSheet
        editing={editing}
        dateISO={dateISO}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function BlockChip({
  block,
  onClick,
}: {
  block: Block;
  onClick: () => void;
}) {
  const startMin = isoToLocalDayMinutes(block.start_at);
  const endMin = isoToLocalDayMinutes(block.end_at);
  const height = Math.max(MIN_BLOCK_MIN, endMin - startMin) * PX_PER_MIN;
  const meta = CATEGORIES_BY_VALUE[block.category];
  return (
    <button
      type="button"
      data-block
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute left-16 right-2 rounded-xl px-3 py-2 flex flex-col gap-0.5 text-left active:scale-[0.99] transition-transform overflow-hidden"
      style={{
        top: `${startMin * PX_PER_MIN}px`,
        height: `${height}px`,
        backgroundColor: meta.cssVar,
      }}
    >
      <div className="text-[11px] font-bold tabular-nums text-[#0B1014]/70">
        {formatTime(startMin)} — {formatTime(endMin)}
      </div>
      <div className="text-sm font-extrabold text-[#0B1014] leading-tight">
        {meta.label}
      </div>
      {block.label && (
        <div className="text-xs text-[#0B1014]/80 leading-tight truncate">
          {block.label}
        </div>
      )}
    </button>
  );
}

function NowLine() {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  return (
    <div
      className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
      style={{ top: `${min * PX_PER_MIN}px` }}
    >
      <div className="w-14" />
      <div className="w-2 h-2 rounded-full bg-primary" />
      <div className="flex-1 border-t-2 border-primary" />
    </div>
  );
}

// Used to silence the unused-import warning for SNAP_MIN in dev.
void SNAP_MIN;
