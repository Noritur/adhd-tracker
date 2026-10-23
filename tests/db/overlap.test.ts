import { describe, expect, it } from "vitest";
import {
  PG,
  backendPid,
  createUser,
  dbUrl,
  insertBlock,
  usePool,
  waitUntilBlocked,
} from "./helpers";

describe.skipIf(!dbUrl)("time_blocks_no_overlap", () => {
  const pool = usePool();

  it("rejects a block that overlaps another block of the same user", async () => {
    const user = await createUser(pool);
    await insertBlock(pool, user, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
    await expect(
      insertBlock(pool, user, "2026-01-15T09:30Z", "2026-01-15T10:30Z"),
    ).rejects.toMatchObject({ code: PG.exclusionViolation });
  });

  it("rejects a block that sits entirely inside another", async () => {
    const user = await createUser(pool);
    await insertBlock(pool, user, "2026-01-15T09:00Z", "2026-01-15T12:00Z");
    await expect(
      insertBlock(pool, user, "2026-01-15T10:00Z", "2026-01-15T10:15Z"),
    ).rejects.toMatchObject({ code: PG.exclusionViolation });
  });

  it("allows blocks that only touch, because ranges are [start, end)", async () => {
    const user = await createUser(pool);
    await insertBlock(pool, user, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
    await expect(
      insertBlock(pool, user, "2026-01-15T10:00Z", "2026-01-15T11:00Z"),
    ).resolves.toBeTypeOf("number");
  });

  it("allows two users to have blocks at the same time", async () => {
    const a = await createUser(pool);
    const b = await createUser(pool);
    await insertBlock(pool, a, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
    await expect(
      insertBlock(pool, b, "2026-01-15T09:00Z", "2026-01-15T10:00Z"),
    ).resolves.toBeTypeOf("number");
  });

  it("rejects an update that moves a block onto another", async () => {
    const user = await createUser(pool);
    await insertBlock(pool, user, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
    const later = await insertBlock(pool, user, "2026-01-15T11:00Z", "2026-01-15T12:00Z");
    await expect(
      pool.query(
        "update adhd_tracker.time_blocks set start_at = $2, end_at = $3 where id = $1",
        [later, "2026-01-15T09:45Z", "2026-01-15T10:45Z"],
      ),
    ).rejects.toMatchObject({ code: PG.exclusionViolation });
  });

  it("rejects a block that ends before it starts or has no length", async () => {
    const user = await createUser(pool);
    await expect(
      insertBlock(pool, user, "2026-01-15T10:00Z", "2026-01-15T09:00Z"),
    ).rejects.toMatchObject({ code: PG.checkViolation });
    await expect(
      insertBlock(pool, user, "2026-01-15T10:00Z", "2026-01-15T10:00Z"),
    ).rejects.toMatchObject({ code: PG.checkViolation });
  });

  it("lets only one of two concurrent overlapping inserts commit", async () => {
    const user = await createUser(pool);
    const first = await pool.connect();
    const second = await pool.connect();
    const insertSql = `insert into adhd_tracker.time_blocks (user_id, start_at, end_at, category)
                       values ($1, $2, $3, 'rest')`;
    try {
      await first.query("begin");
      await first.query(insertSql, [user, "2026-01-15T09:00Z", "2026-01-15T10:00Z"]);

      await second.query("begin");
      const pid = await backendPid(second);
      const pending = second
        .query(insertSql, [user, "2026-01-15T09:30Z", "2026-01-15T10:30Z"])
        .then(() => "inserted", (e: { code?: string }) => e.code);
      // The second insert must be waiting on the first transaction.
      await waitUntilBlocked(pool, pid);

      await first.query("commit");
      await expect(pending).resolves.toBe(PG.exclusionViolation);
      await second.query("rollback");
    } finally {
      first.release();
      second.release();
    }

    const { rows } = await pool.query(
      "select count(*)::int as n from adhd_tracker.time_blocks where user_id = $1",
      [user],
    );
    expect(rows[0].n).toBe(1);
  });
});
