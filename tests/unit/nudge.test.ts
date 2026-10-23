import { describe, expect, it } from "vitest";
import type { Category } from "@/lib/categories";
import type { Mood, TickBlock } from "@/lib/db/blocks";
import { detectNudge } from "@/lib/rules/nudge";

const day = "2026-01-15";
let nextId = 1;

function tick(start: string, end: string, category: Category, mood: Mood | null = null): TickBlock {
  return {
    id: nextId++,
    user_id: "00000000-0000-0000-0000-000000000001",
    start_at: `${day}T${start}:00Z`,
    end_at: `${day}T${end}:00Z`,
    category,
    label: null,
    mood,
    notified_ending_at: null,
    notified_started_at: null,
  };
}

const at = (hhmm: string) => new Date(`${day}T${hhmm}:00Z`).getTime();

describe("detectNudge", () => {
  it("returns null for a calm day", () => {
    const blocks = [tick("09:00", "09:50", "coded", "ok"), tick("10:30", "11:00", "rest", "fire")];
    expect(detectNudge(blocks, at("12:00"))).toBeNull();
  });

  it("spots two swamp moods in a row among rated blocks", () => {
    const blocks = [
      tick("09:00", "09:30", "chores", "swamp"),
      tick("10:00", "10:30", "other"), // unrated, skipped
      tick("11:00", "11:30", "social", "swamp"),
    ];
    expect(detectNudge(blocks, at("12:00"))).toBe("swamp_streak");
  });

  it("only counts blocks that have already ended", () => {
    const blocks = [tick("09:00", "09:30", "chores", "swamp"), tick("11:30", "12:30", "social", "swamp")];
    expect(detectNudge(blocks, at("12:00"))).toBeNull();
  });

  it("reads blocks in time order whatever order they arrive in", () => {
    const blocks = [
      tick("11:00", "11:30", "social", "swamp"),
      tick("08:00", "08:30", "rest", "fire"),
      tick("10:00", "10:30", "chores", "swamp"),
    ];
    expect(detectNudge(blocks, at("12:00"))).toBe("swamp_streak");
  });

  it("spots two focus blocks with less than 15 minutes between them", () => {
    const blocks = [tick("09:00", "09:50", "coded"), tick("10:00", "10:50", "work_other")];
    expect(detectNudge(blocks, at("11:00"))).toBe("focus_no_break");
  });

  it("accepts a gap of exactly 15 minutes as a break", () => {
    const blocks = [tick("09:00", "09:50", "coded"), tick("10:05", "10:55", "coded")];
    expect(detectNudge(blocks, at("11:00"))).toBeNull();
  });

  it("treats a non-focus block in between as a break", () => {
    const blocks = [
      tick("09:00", "09:50", "coded"),
      tick("09:50", "09:55", "rest"),
      tick("09:55", "10:45", "coded"),
    ];
    expect(detectNudge(blocks, at("11:00"))).toBeNull();
  });

  it("prefers the swamp streak when both patterns are present", () => {
    const blocks = [
      tick("09:00", "09:50", "coded", "swamp"),
      tick("09:55", "10:45", "coded", "swamp"),
    ];
    expect(detectNudge(blocks, at("11:00"))).toBe("swamp_streak");
  });
});
