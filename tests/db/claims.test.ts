/**
 * The cron routes run as service_role and "claim" a row before sending a
 * push: an UPDATE guarded by "not yet sent", so of two overlapping cron runs
 * only one gets the row back. These tests check the database half of that
 * contract with the same SQL shape the supabase-js calls produce
 * (`.update().eq().is(..., null).select("id")` and the `.or(...)` variant).
 * tests/unit/claims.test.ts checks that lib/db/claims.ts, which the routes
 * call, builds exactly that shape.
 */
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { localDayBoundsUTC } from "@/lib/time/tz";
import { backendPid, createUser, dbUrl, insertBlock, usePool, waitUntilBlocked } from "./helpers";

const CLAIM_STARTED = `update adhd_tracker.time_blocks set notified_started_at = $2
                       where id = $1 and notified_started_at is null returning id`;

const CLAIM_MORNING = `update adhd_tracker.profiles set last_morning_nudge_at = $2
                       where id = $1 and (last_morning_nudge_at is null or last_morning_nudge_at < $3)
                       returning id`;

async function claimOnce(pool: Pool, sql: string, params: unknown[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const { rowCount } = await client.query(sql, params);
    await client.query("commit");
    return rowCount ?? 0;
  } finally {
    client.release();
  }
}

/** Two cron runs claim the same row at the same moment; returns each one's result. */
async function claimConcurrently(pool: Pool, sql: string, params: unknown[]): Promise<[number, number]> {
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    for (const c of [first, second]) {
      await c.query("begin");
      await c.query("set local role service_role");
    }
    const firstResult = await first.query(sql, params);

    const pid = await backendPid(second);
    const pending = second.query(sql, params);
    // The second claim has to wait for the first transaction's row lock.
    await waitUntilBlocked(pool, pid);

    await first.query("commit");
    const secondResult = await pending;
    await second.query("commit");
    return [firstResult.rowCount ?? 0, secondResult.rowCount ?? 0];
  } finally {
    first.release();
    second.release();
  }
}

describe.skipIf(!dbUrl)("claim before send", () => {
  const pool = usePool();
  const now = "2026-01-15T09:01:00Z";

  describe("block started notification", () => {
    it("is claimed once, and a rerun of the cron gets nothing", async () => {
      const user = await createUser(pool);
      const block = await insertBlock(pool, user, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
      expect(await claimOnce(pool, CLAIM_STARTED, [block, now])).toBe(1);
      expect(await claimOnce(pool, CLAIM_STARTED, [block, "2026-01-15T09:02:00Z"])).toBe(0);
    });

    it("has exactly one winner when two cron runs overlap", async () => {
      const user = await createUser(pool);
      const block = await insertBlock(pool, user, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
      const results = await claimConcurrently(pool, CLAIM_STARTED, [block, now]);
      expect(results).toEqual([1, 0]);
    });
  });

  describe("morning nudge, once per local day", () => {
    const tz = "Europe/Madrid";
    const { start: dayStart } = localDayBoundsUTC(new Date(now), tz);
    const params = (user: string) => [user, now, dayStart.toISOString()];

    it("is claimed when it was never sent", async () => {
      const user = await createUser(pool);
      expect(await claimOnce(pool, CLAIM_MORNING, params(user))).toBe(1);
    });

    it("is claimed again when the last one went out yesterday, local time", async () => {
      const user = await createUser(pool);
      // 23:30 local on the 14th: before today's local midnight (23:00 UTC).
      await pool.query("update adhd_tracker.profiles set last_morning_nudge_at = $2 where id = $1", [
        user,
        "2026-01-14T22:30:00Z",
      ]);
      expect(await claimOnce(pool, CLAIM_MORNING, params(user))).toBe(1);
    });

    it("is not claimed twice on the same local day", async () => {
      const user = await createUser(pool);
      // 00:30 local on the 15th, right after local midnight.
      await pool.query("update adhd_tracker.profiles set last_morning_nudge_at = $2 where id = $1", [
        user,
        "2026-01-14T23:30:00Z",
      ]);
      expect(await claimOnce(pool, CLAIM_MORNING, params(user))).toBe(0);
    });

    it("has exactly one winner when two cron runs overlap", async () => {
      const user = await createUser(pool);
      expect(await claimConcurrently(pool, CLAIM_MORNING, params(user))).toEqual([1, 0]);
    });
  });
});
