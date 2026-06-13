"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BlockEditSheet,
  type EditingBlock,
} from "@/components/block-edit-sheet";
import { FabMenu } from "@/components/fab-menu";
import {
  updateBlockTimesAction,
  cascadeBlockTimesAction,
} from "@/app/today/actions";
import {
  CATEGORIES_BY_VALUE,
  DEFAULT_CATEGORY,
} from "@/lib/categories";
import {
  DAY_MINUTES,
  MIN_BLOCK_MIN,
  PX_PER_MIN,
  clampMin,
  computeCascade,
  formatTime,
  isoToMinutesInTZ,
  minutesToISOInTZ,
  snap,
} from "@/lib/time/slots";
import type { Block } from "@/lib/db/blocks";

const TAP_THRESHOLD_PX = 6;
const RESIZE_HIT_PX = 12;
// Below this chip height the 12px edge zones overlap (15min block = 15px)
// and the move zone vanishes — short chips drag as a whole, resize via the
// edit sheet. Must stay in sync with the `tight` tier that hides hint bars.
const RESIZE_MIN_HEIGHT_PX = 36;

type DragMode = "move" | "resize-top" | "resize-bottom";

/**
 * Find the vertical "lane" a block can occupy without overlapping others:
 * everything between the latest end_at above and the earliest start_at below.
 */
function getLaneBounds(
  origStart: number,
  origEnd: number,
  otherBlocks: Block[],
  tz: string,
): { maxAbove: number; minBelow: number } {
  let maxAbove = 0;
  let minBelow = DAY_MINUTES;
  for (const b of otherBlocks) {
    const bStart = isoToMinutesInTZ(b.start_at, tz);
    const bEnd = isoToMinutesInTZ(b.end_at, tz);
    if (bEnd <= origStart) maxAbove = Math.max(maxAbove, bEnd);
    if (bStart >= origEnd) minBelow = Math.min(minBelow, bStart);
  }
  return { maxAbove, minBelow };
}

export function TimelineDay({
  initialBlocks,
  ymd,
  tz,
}: {
  initialBlocks: Block[];
  /** Local-day YMD (in `tz`) the timeline represents. */
  ymd: string;
  /** Profile timezone — drives all time math and now-line. */
  tz: string;
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
      const bStart = isoToMinutesInTZ(b.start_at, tz);
      const bEnd = isoToMinutesInTZ(b.end_at, tz);
      if (bStart <= startMin && startMin < bEnd) return null;
    }
    let nearestBelow = DAY_MINUTES;
    for (const b of blocksRef.current) {
      const bStart = isoToMinutesInTZ(b.start_at, tz);
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
    // Now-minute in user's profile TZ, not the browser's.
    const min = clampMin(snap(isoToMinutesInTZ(new Date().toISOString(), tz)));
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

  // Snapshot of block times captured at pointer-down; cascade previews are
  // recomputed from it every frame so the downward push never compounds.
  const dragSnapshotRef = useRef<Block[] | null>(null);

  const beginDrag = () => {
    dragSnapshotRef.current = blocksRef.current;
  };

  // Live preview while dragging. Resize touches only the dragged block; move
  // runs the Sunsama cascade against the snapshot and rebuilds every block
  // from it (unchanged ones snap back to their original slot).
  const previewDrag = (
    id: number,
    kind: DragMode,
    newStart: number,
    newEnd: number,
  ) => {
    if (kind !== "move") {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                start_at: minutesToISOInTZ(ymd, newStart, tz),
                end_at: minutesToISOInTZ(ymd, newEnd, tz),
              }
            : b,
        ),
      );
      return;
    }
    const base = dragSnapshotRef.current ?? blocksRef.current;
    const mins = base.map((b) => ({
      id: b.id,
      startMin: isoToMinutesInTZ(b.start_at, tz),
      endMin: isoToMinutesInTZ(b.end_at, tz),
    }));
    const changed = computeCascade(id, newStart, newEnd, mins);
    if (!changed) return; // chain wouldn't fit — hold the last good frame
    setBlocks(
      base.map((b) => {
        const ch = changed.find((c) => c.id === b.id);
        if (!ch) return b;
        return {
          ...b,
          start_at: minutesToISOInTZ(ymd, ch.startMin, tz),
          end_at: minutesToISOInTZ(ymd, ch.endMin, tz),
        };
      }),
    );
  };

  const commitDrag = async (id: number, kind: DragMode) => {
    const snapshot = dragSnapshotRef.current;
    dragSnapshotRef.current = null;

    if (kind !== "move") {
      const current = blocksRef.current.find((b) => b.id === id);
      if (!current) return;
      const res = await updateBlockTimesAction(
        id,
        current.start_at,
        current.end_at,
      );
      if (res?.error && snapshot) {
        setBlocks(snapshot);
        toast.error(res.error);
      }
      return;
    }

    // Collect every block whose time differs from the snapshot (dragged + pushed).
    const updates = blocksRef.current
      .filter((b) => {
        const orig = snapshot?.find((s) => s.id === b.id);
        return (
          orig &&
          (orig.start_at !== b.start_at || orig.end_at !== b.end_at)
        );
      })
      .map((b) => ({ id: b.id, start_at: b.start_at, end_at: b.end_at }));

    if (updates.length === 0) return;
    const res = await cascadeBlockTimesAction(updates);
    if (res?.error && snapshot) {
      setBlocks(snapshot);
      toast.error(res.error);
    }
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

          <NowLine tz={tz} />

          {blocks.map((block) => (
            <BlockChip
              key={block.id}
              block={block}
              otherBlocks={blocks.filter((b) => b.id !== block.id)}
              tz={tz}
              onTap={() =>
                setEditing({
                  id: block.id,
                  startMin: isoToMinutesInTZ(block.start_at, tz),
                  endMin: isoToMinutesInTZ(block.end_at, tz),
                  category: block.category,
                  label: block.label ?? "",
                })
              }
              onDragStart={beginDrag}
              onPreview={previewDrag}
              onCommit={commitDrag}
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

      </div>

      <FabMenu onNewBlock={openCreateNow} />

      <BlockEditSheet
        editing={editing}
        ymd={ymd}
        tz={tz}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function BlockChip({
  block,
  otherBlocks,
  tz,
  onTap,
  onDragStart,
  onPreview,
  onCommit,
}: {
  block: Block;
  otherBlocks: Block[];
  tz: string;
  onTap: () => void;
  onDragStart: () => void;
  onPreview: (
    id: number,
    kind: DragMode,
    newStart: number,
    newEnd: number,
  ) => void;
  onCommit: (id: number, kind: DragMode) => Promise<void>;
}) {
  const startMin = isoToMinutesInTZ(block.start_at, tz);
  const endMin = isoToMinutesInTZ(block.end_at, tz);
  const height = Math.max(MIN_BLOCK_MIN, endMin - startMin) * PX_PER_MIN;
  // Adaptive content tiers — keep geometry (1min=1px) untouched, only
  // change how much text/padding fits.
  const compact = height < 64;
  const tight = height < 36;
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
    if (rect.height >= RESIZE_MIN_HEIGHT_PX) {
      if (offsetY < RESIZE_HIT_PX) mode = "resize-top";
      else if (offsetY > rect.height - RESIZE_HIT_PX) mode = "resize-bottom";
    }

    dragRef.current = {
      mode,
      startY: e.clientY,
      origStart: isoToMinutesInTZ(block.start_at, tz),
      origEnd: isoToMinutesInTZ(block.end_at, tz),
      dragging: false,
      pointerId: e.pointerId,
    };
    target.setPointerCapture(e.pointerId);
    setActiveMode(mode);
    onDragStart();
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
      tz,
    );

    if (state.mode === "move") {
      const duration = state.origEnd - state.origStart;
      newStart = clampMin(state.origStart + deltaMin);
      // Up-stop against the block above; downward overlap is absorbed by the
      // cascade in the parent (blocks below get pushed), so no minBelow clamp.
      newStart = Math.max(maxAbove, newStart);
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

    onPreview(block.id, state.mode, newStart, newEnd);
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const wasDragging = state.dragging;
    const mode = state.mode;
    dragRef.current = null;
    setActiveMode(null);
    if (wasDragging) {
      await onCommit(block.id, mode);
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
      className={`absolute left-16 right-2 rounded-xl flex flex-col text-left overflow-hidden touch-none select-none shadow-sm ${
        tight
          ? "px-2 py-0.5 justify-center gap-0"
          : compact
            ? "px-3 py-1 gap-0"
            : "px-3 py-2 gap-0.5"
      }`}
      style={{
        top: `${startMin * PX_PER_MIN}px`,
        height: `${height}px`,
        backgroundColor: meta.cssVar,
        cursor,
      }}
    >
      {block.mood && (
        <span
          className="absolute top-1 right-2 text-xs leading-none pointer-events-none"
          aria-hidden
        >
          {block.mood === "fire"
            ? "🔥"
            : block.mood === "ok"
              ? "😐"
              : "🫠"}
        </span>
      )}

      {/* Resize hint bars — hidden on tight blocks where edge-resize is
          also disabled (RESIZE_MIN_HEIGHT_PX): whole chip drags, resize
          happens in the edit sheet. */}
      {!tight && (
        <>
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
        </>
      )}

      {tight ? (
        <div className="text-[11px] font-bold text-[#0B1014] leading-none truncate">
          {block.label || meta.label}
        </div>
      ) : compact ? (
        <>
          <div className="text-[13px] font-extrabold text-[#0B1014] leading-tight truncate">
            {block.label || meta.label}
          </div>
          {block.label && (
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#0B1014]/60 leading-none truncate">
              {meta.label}
            </div>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </button>
  );
}

function NowLine({ tz }: { tz: string }) {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      // Render the now-line where it would appear on the user's local
      // clock, not the device clock. For travelers / wrong device TZ
      // these can diverge by hours.
      setMin(isoToMinutesInTZ(new Date().toISOString(), tz));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [tz]);

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
