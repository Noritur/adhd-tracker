import { describe, expect, it } from "vitest";
import { findLargestFreeSlot } from "@/lib/ai/apply-plan";

describe("findLargestFreeSlot", () => {
  it("returns the whole window when nothing is busy", () => {
    expect(findLargestFreeSlot(540, 600, [], 15)).toEqual({ start: 540, end: 600 });
  });

  it("picks the largest gap between busy blocks", () => {
    const busy = [
      { start: 560, end: 580 },
      { start: 600, end: 650 },
    ];
    // Gaps: 540-560 (20), 580-600 (20), 650-720 (70).
    expect(findLargestFreeSlot(540, 720, busy, 15)).toEqual({ start: 650, end: 720 });
  });

  it("clips busy blocks to the window and merges overlapping ones", () => {
    const busy = [
      { start: 500, end: 560 },
      { start: 550, end: 600 },
      { start: 590, end: 610 },
    ];
    expect(findLargestFreeSlot(540, 660, busy, 15)).toEqual({ start: 610, end: 660 });
  });

  it("ignores busy blocks entirely outside the window", () => {
    const busy = [
      { start: 100, end: 200 },
      { start: 900, end: 960 },
    ];
    expect(findLargestFreeSlot(540, 600, busy, 15)).toEqual({ start: 540, end: 600 });
  });

  it("returns null when no gap is long enough", () => {
    const busy = [
      { start: 540, end: 590 },
      { start: 600, end: 660 },
    ];
    expect(findLargestFreeSlot(540, 660, busy, 15)).toBeNull();
  });

  it("returns null when the window is fully booked", () => {
    expect(findLargestFreeSlot(540, 600, [{ start: 500, end: 700 }], 15)).toBeNull();
  });
});
