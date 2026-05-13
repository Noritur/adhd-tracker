"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  BlockEditSheet,
  type EditingBlock,
} from "@/components/block-edit-sheet";
import { updateBlockTimesAction } from "@/app/today/actions";
import {
  CATEGORIES_BY_VALUE,
  DEFAULT_CATEGORY,
} from "@/lib/categories";
import {
  DAY_MINUTES,
  MIN_BLOCK_MIN,
  PX_PER_MIN,
  clampMin,
  formatTime,
  isoToLocalDayMinutes,
  localDayMinutesToISO,
  snap,
} from "@/lib/time/slots";
import type { Block } from "@/lib/db/blocks";

const TAP_THRESHOLD_PX = 6;
const RESIZE_HIT_PX = 12;

type DragMode = "move" | "resize-top" | "resize-bottom";

/**
 * Find the vertical "lane" a block can occupy without overlapping others:
 * everything between the latest end_at above and the earliest start_at below.
 */
function getLaneBounds(
  origStart: number,
  origEnd: number,
  otherBlocks: Block[],
): { maxAbove: number; minBelow: number } {
  let maxAbove = 0;
  let minBelow = DAY_MINUTES;
  for (const b of otherBlocks) {
    const bStart = isoToLocalDayMinutes(b.start_at);
    const bEnd = isoToLocalDayMinutes(b.end_at);
    if (bEnd <= origStart) maxAbove = Math.max(maxAbove, bEnd);
    if (bStart >= origEnd) minBelow = Math.min(minBelow, bStart);
  }
  return { maxAbove, minBelow };
}

export function TimelineDay({
  initialBlocks,
  dateISO,
}: {
  initialBlocks: Block[];
  dateISO: string;
}) {
  // Local mirror of blocks so drag previews are immediate.
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editing, setEditing] = useState<EditingBlock | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync when server revalidates with fresh data.
  useEffect(() => {
    setBlocks(initialBlocks);
  }, [initialBlocks]);

  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-block]")) return;
    // record start to distinguish tap from accidental drag
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > TAP_THRESHOLD_PX) {
        cancel();
      }
    };
    const onUp = (ev: PointerEvent) => {
      cancel();
      if (Math.abs(ev.clientY - startY) <= TAP_THRESHOLD_PX) {
        openCreateAtY(ev.clientY);
      }
    };
    const cancel = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
  };

  /** Clamp a proposed [start, end) to avoid overlap with existing blocks. */
  const fitInGap = (startMin: number, desiredEnd: number) => {
    // If start falls inside any block, refuse (caller should ignore tap)
    for (const b of blocksRef.current) {
      const bStart = isoToLocalDayMinutes(b.start_at);
      const bEnd = isoToLocalDayMinutes(b.end_at);
      if (bStart <= startMin && startMin < bEnd) return null;
    }
    let nearestBelow = DAY_MINUTES;
    for (const b of blocksRef.current) {
      const bStart = isoToLocalDayMinutes(b.start_at);
      if (bStart > startMin && bStart < nearestBelow) nearestBelow = bStart;
    }
    const endMin = Math.min(desiredEnd, nearestBelow);
    if (endMin - startMin < MIN_BLOCK_MIN) return null;
    return { startMin, endMin };
  };

  const openCreateAtY = (clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const rawMin = Math.round(y / PX_PER_MIN);
    const startMin = clampMin(snap(rawMin));
    const fit = fitInGap(startMin, startMin + 60);
    if (!fit) return;
    setEditing({
      startMin: fit.startMin,
      endMin: fit.endMin,
      category: DEFAULT_CATEGORY,
      label: "",
    });
  };

  const openCreateNow = () => {
    const now = new Date();
    const min = clampMin(snap(now.getHours() * 60 + now.getMinutes()));
    const desiredStart = clampMin(min - 30);
    const desiredEnd = clampMin(min + 30);
    const fit = fitInGap(desiredStart, desiredEnd);
    if (!fit) {
      // Fallback: try to start at `min` itself if "now ± 30" collides
      const fallback = fitInGap(min, min + 60);
      if (!fallback) return;
      setEditing({
        ...fallback,
        category: DEFAULT_CATEGORY,
        label: "",
      });
      return;
    }
    setEditing({
      startMin: fit.startMin,
      endMin: fit.endMin,
      category: DEFAULT_CATEGORY,
      label: "",
    });
  };

  const updateBlockLocal = (id: number, patch: Partial<Block>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  };

  const commitBlockTimes = async (id: number) => {
    const current = blocksRef.current.find((b) => b.id === id);
    if (!current) return;
    await updateBlockTimesAction(id, current.start_at, current.end_at);
  };

  // Keep a ref to latest blocks for use inside async drop handlers
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  return (
    <>
      <div className="relative">
        <div
          ref={containerRef}
          onPointerDown={onGridPointerDown}
          className="relative bg-card rounded-3xl border border-border overflow-hidden touch-pan-y select-none"
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

          <NowLine />

          {blocks.map((block) => (
            <BlockChip
              key={block.id}
              block={block}
              otherBlocks={blocks.filter((b) => b.id !== block.id)}
              dateISO={dateISO}
              onTap={() =>
                setEditing({
                  id: block.id,
                  startMin: isoToLocalDayMinutes(block.start_at),
                  endMin: isoToLocalDayMinutes(block.end_at),
                  category: block.category,
                  label: block.label ?? "",
                })
              }
              onLocalChange={updateBlockLocal}
              onCommit={commitBlockTimes}
            />
          ))}

          {blocks.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm text-muted-foreground">
                тапни будь-де щоб додати блок
              </span>
            </div>
          )}
        </div>

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
  otherBlocks,
  dateISO,
  onTap,
  onLocalChange,
  onCommit,
}: {
  block: Block;
  otherBlocks: Block[];
  dateISO: string;
  onTap: () => void;
  onLocalChange: (id: number, patch: Partial<Block>) => void;
  onCommit: (id: number) => Promise<void>;
}) {
  const startMin = isoToLocalDayMinutes(block.start_at);
  const endMin = isoToLocalDayMinutes(block.end_at);
  const height = Math.max(MIN_BLOCK_MIN, endMin - startMin) * PX_PER_MIN;
  const meta = CATEGORIES_BY_VALUE[block.category];

  const dragRef = useRef<{
    mode: DragMode;
    startY: number;
    origStart: number;
    origEnd: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);
  const [activeMode, setActiveMode] = useState<DragMode | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let mode: DragMode = "move";
    if (offsetY < RESIZE_HIT_PX) mode = "resize-top";
    else if (offsetY > rect.height - RESIZE_HIT_PX) mode = "resize-bottom";

    dragRef.current = {
      mode,
      startY: e.clientY,
      origStart: isoToLocalDayMinutes(block.start_at),
      origEnd: isoToLocalDayMinutes(block.end_at),
      dragging: false,
      pointerId: e.pointerId,
    };
    target.setPointerCapture(e.pointerId);
    setActiveMode(mode);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dy = e.clientY - state.startY;
    if (!state.dragging && Math.abs(dy) < TAP_THRESHOLD_PX) return;
    state.dragging = true;

    const deltaMin = snap(Math.round(dy / PX_PER_MIN));
    let newStart = state.origStart;
    let newEnd = state.origEnd;
    const { maxAbove, minBelow } = getLaneBounds(
      state.origStart,
      state.origEnd,
      otherBlocks,
    );

    if (state.mode === "move") {
      const duration = state.origEnd - state.origStart;
      newStart = clampMin(state.origStart + deltaMin);
      // Clamp into lane between adjacent blocks (no overlap)
      newStart = Math.max(maxAbove, Math.min(minBelow - duration, newStart));
      newEnd = newStart + duration;
      if (newEnd > DAY_MINUTES) {
        newEnd = DAY_MINUTES;
        newStart = newEnd - duration;
      }
    } else if (state.mode === "resize-top") {
      newStart = clampMin(state.origStart + deltaMin);
      newStart = Math.max(maxAbove, newStart);
      if (newStart > state.origEnd - MIN_BLOCK_MIN) {
        newStart = state.origEnd - MIN_BLOCK_MIN;
      }
    } else {
      newEnd = clampMin(state.origEnd + deltaMin);
      newEnd = Math.min(minBelow, newEnd);
      if (newEnd < state.origStart + MIN_BLOCK_MIN) {
        newEnd = state.origStart + MIN_BLOCK_MIN;
      }
    }

    onLocalChange(block.id, {
      start_at: localDayMinutesToISO(new Date(dateISO), newStart),
      end_at: localDayMinutesToISO(new Date(dateISO), newEnd),
    });
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const wasDragging = state.dragging;
    dragRef.current = null;
    setActiveMode(null);
    if (wasDragging) {
      await onCommit(block.id);
    } else {
      onTap();
    }
  };

  const cursor =
    activeMode === "resize-top" || activeMode === "resize-bottom"
      ? "ns-resize"
      : activeMode === "move"
        ? "grabbing"
        : "grab";

  return (
    <button
      type="button"
      data-block
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setActiveMode(null);
      }}
      className="absolute left-16 right-2 rounded-xl px-3 py-2 flex flex-col gap-0.5 text-left overflow-hidden touch-none select-none shadow-sm"
      style={{
        top: `${startMin * PX_PER_MIN}px`,
        height: `${height}px`,
        backgroundColor: meta.cssVar,
        cursor,
      }}
    >
      {/* Resize hint bars at top/bottom edges */}
      <span
        className="absolute left-0 right-0 top-0 h-3 flex items-center justify-center"
        aria-hidden
      >
        <span className="w-8 h-0.5 rounded-full bg-[#0B1014]/30" />
      </span>
      <span
        className="absolute left-0 right-0 bottom-0 h-3 flex items-center justify-center"
        aria-hidden
      >
        <span className="w-8 h-0.5 rounded-full bg-[#0B1014]/30" />
      </span>

      <div className="text-[11px] font-bold tabular-nums text-[#0B1014]/70 mt-2">
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
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setMin(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (min === null) return null;
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
