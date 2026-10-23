/**
 * The query each claim builds. tests/db/claims.test.ts checks that this
 * shape gives one winner in Postgres; this file checks that the code the
 * cron routes call really builds that shape.
 */
import { describe, expect, it } from "vitest";
import { claimBlockNotification, claimDailySlot } from "@/lib/db/claims";

type Call = [string, ...unknown[]];

/** Records every builder call and resolves to `result` when awaited. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "update", "eq", "is", "or", "select"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { client: builder as unknown as Parameters<typeof claimDailySlot>[0], calls };
}

const NOW = "2026-01-15T09:01:00.000Z";
const DAY_START = "2026-01-14T23:00:00.000Z";

describe("claimBlockNotification", () => {
  it("updates only while the notification is still unsent", async () => {
    const { client, calls } = fakeClient({ data: [{ id: 42 }], error: null });
    await expect(claimBlockNotification(client, 42, "notified_started_at", NOW)).resolves.toBe(true);
    expect(calls).toEqual([
      ["from", "time_blocks"],
      ["update", { notified_started_at: NOW }],
      ["eq", "id", 42],
      ["is", "notified_started_at", null],
      ["select", "id"],
    ]);
  });

  it("guards the same column it sets", async () => {
    const { client, calls } = fakeClient({ data: [{ id: 7 }], error: null });
    await claimBlockNotification(client, 7, "notified_ending_at", NOW);
    expect(calls).toContainEqual(["update", { notified_ending_at: NOW }]);
    expect(calls).toContainEqual(["is", "notified_ending_at", null]);
  });

  it("reports a lost race as not claimed", async () => {
    const { client } = fakeClient({ data: [], error: null });
    await expect(claimBlockNotification(client, 42, "notified_started_at", NOW)).resolves.toBe(false);
  });

  it("reports a failed query as not claimed", async () => {
    const { client } = fakeClient({ data: null, error: { message: "connection reset" } });
    await expect(claimBlockNotification(client, 42, "notified_started_at", NOW)).resolves.toBe(false);
  });
});

describe("claimDailySlot", () => {
  it("updates only when the slot is unused or was last used before local midnight", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "u1" }], error: null });
    await expect(
      claimDailySlot(client, "u1", "last_morning_nudge_at", NOW, DAY_START),
    ).resolves.toBe(true);
    expect(calls).toEqual([
      ["from", "profiles"],
      ["update", { last_morning_nudge_at: NOW }],
      ["eq", "id", "u1"],
      ["or", `last_morning_nudge_at.is.null,last_morning_nudge_at.lt.${DAY_START}`],
      ["select", "id"],
    ]);
  });

  it("uses the coach column for the coach slot", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "u1" }], error: null });
    await claimDailySlot(client, "u1", "last_proactive_at", NOW, DAY_START);
    expect(calls).toContainEqual(["or", `last_proactive_at.is.null,last_proactive_at.lt.${DAY_START}`]);
  });

  it("reports a lost race as not claimed", async () => {
    const { client } = fakeClient({ data: [], error: null });
    await expect(
      claimDailySlot(client, "u1", "last_proactive_at", NOW, DAY_START),
    ).resolves.toBe(false);
  });
});
