import { describe, expect, it } from "vitest";
import type { Category } from "@/lib/categories";
import { MAX_FOCUS_MIN, isFocus, validateFocusBlock } from "@/lib/rules/focus-limits";

const MIN = 60_000;
const start = Date.UTC(2026, 0, 15, 9, 0);
const blockOf = (category: Category, minutes: number) => ({
  category,
  startMs: start,
  endMs: start + minutes * MIN,
});

describe("validateFocusBlock", () => {
  it("allows a focus block of exactly the cap", () => {
    expect(validateFocusBlock(blockOf("coded", MAX_FOCUS_MIN))).toEqual({ ok: true });
    expect(validateFocusBlock(blockOf("work_other", 50))).toEqual({ ok: true });
  });

  it("rejects a focus block one minute over the cap", () => {
    const result = validateFocusBlock(blockOf("coded", 51));
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("does not limit non-focus categories", () => {
    for (const category of ["sport", "rest", "social", "chores", "outdoors", "other"] as Category[]) {
      expect(isFocus(category)).toBe(false);
      expect(validateFocusBlock(blockOf(category, 240))).toEqual({ ok: true });
    }
  });
});
