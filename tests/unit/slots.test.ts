import { describe, expect, it } from "vitest";
import {
  type CascadeBlock,
  computeCascade,
  formatDuration,
  formatTime,
  snap,
  timeStringToMin,
} from "@/lib/time/slots";

const block = (id: number, startMin: number, endMin: number): CascadeBlock => ({
  id,
  startMin,
  endMin,
});

function byId(changed: CascadeBlock[] | null): Record<number, [number, number]> {
  expect(changed).not.toBeNull();
  return Object.fromEntries(
    (changed as CascadeBlock[]).map((b) => [b.id, [b.startMin, b.endMin]]),
  );
}

describe("computeCascade", () => {
  // 09:00-10:00, 10:00-11:00, then a gap, 12:00-13:00.
  const day = [block(1, 540, 600), block(2, 600, 660), block(3, 720, 780)];

  it("pushes the next block down and lets the gap absorb the rest", () => {
    const changed = computeCascade(1, 570, 630, day);
    expect(byId(changed)).toEqual({ 1: [570, 630], 2: [630, 690] });
  });

  it("pushes blocks up when dragging upwards", () => {
    const changed = computeCascade(2, 570, 630, day);
    expect(byId(changed)).toEqual({ 2: [570, 630], 1: [510, 570] });
  });

  it("keeps every pushed block's duration", () => {
    const changed = computeCascade(1, 600, 690, day) as CascadeBlock[];
    for (const b of changed.filter((c) => c.id !== 1)) {
      const original = day.find((d) => d.id === b.id) as CascadeBlock;
      expect(b.endMin - b.startMin).toBe(original.endMin - original.startMin);
    }
    expect(byId(changed)).toEqual({ 1: [600, 690], 2: [690, 750], 3: [750, 810] });
  });

  it("returns only the dragged block when nothing is in the way", () => {
    expect(computeCascade(3, 800, 860, day)).toEqual([block(3, 800, 860)]);
  });

  it("refuses a push that would run past midnight", () => {
    const late = [block(1, 1320, 1380), block(2, 1380, 1440)];
    expect(computeCascade(1, 1350, 1410, late)).toBeNull();
  });

  it("refuses a push that would run before midnight", () => {
    const early = [block(1, 0, 60), block(2, 60, 120)];
    expect(computeCascade(2, 30, 90, early)).toBeNull();
  });

  it("refuses a target outside the day and an unknown block", () => {
    expect(computeCascade(1, 1400, 1460, day)).toBeNull();
    expect(computeCascade(1, -15, 45, day)).toBeNull();
    expect(computeCascade(99, 540, 600, day)).toBeNull();
  });

  it("computes from the snapshot it is given, without mutating it", () => {
    const snapshot = structuredClone(day);
    computeCascade(1, 600, 690, snapshot);
    expect(snapshot).toEqual(day);
  });
});

describe("formatting and parsing", () => {
  it("formats minutes of day and wraps around midnight", () => {
    expect(formatTime(570)).toBe("09:30");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1440)).toBe("00:00");
    expect(formatTime(-15)).toBe("23:45");
  });

  it("snaps to the nearest 15 minutes", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(52)).toBe(45);
    expect(snap(53)).toBe(60);
  });

  it("parses HH:MM and treats garbage as zero", () => {
    expect(timeStringToMin("09:30")).toBe(570);
    expect(timeStringToMin("23:59")).toBe(1439);
    expect(timeStringToMin("")).toBe(0);
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45хв");
    expect(formatDuration(120)).toBe("2г");
    expect(formatDuration(95)).toBe("1г 35хв");
  });
});
