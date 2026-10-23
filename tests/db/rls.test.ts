import { describe, expect, it } from "vitest";
import { PG, as, asUser, createUser, dbUrl, insertBlock, usePool } from "./helpers";

describe.skipIf(!dbUrl)("row-level security", () => {
  const pool = usePool();

  describe("time_blocks", () => {
    it("shows a user only their own blocks", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      const mine = await insertBlock(pool, a, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
      await insertBlock(pool, b, "2026-01-15T09:00Z", "2026-01-15T10:00Z");

      const ids = await asUser(pool, a, async (c) => {
        const { rows } = await c.query("select id, user_id from adhd_tracker.time_blocks");
        return rows;
      });
      expect(ids).toEqual([{ id: String(mine), user_id: a }]);
    });

    it("does not let a user change or delete someone else's block", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      const theirs = await insertBlock(pool, b, "2026-01-15T09:00Z", "2026-01-15T10:00Z");

      const [updated, deleted] = await asUser(pool, a, async (c) => {
        const u = await c.query(
          "update adhd_tracker.time_blocks set label = 'hijacked' where id = $1",
          [theirs],
        );
        const d = await c.query("delete from adhd_tracker.time_blocks where id = $1", [theirs]);
        return [u.rowCount, d.rowCount];
      });
      expect([updated, deleted]).toEqual([0, 0]);

      const { rows } = await pool.query(
        "select label from adhd_tracker.time_blocks where id = $1",
        [theirs],
      );
      expect(rows).toEqual([{ label: null }]);
    });

    it("rejects a block inserted with someone else's user_id", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      await expect(
        asUser(pool, a, (c) =>
          c.query(
            `insert into adhd_tracker.time_blocks (user_id, start_at, end_at, category)
             values ($1, '2026-01-15T09:00Z', '2026-01-15T10:00Z', 'rest')`,
            [b],
          ),
        ),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
    });

    it("rejects handing your own block over to another user", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      const mine = await insertBlock(pool, a, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
      await expect(
        asUser(pool, a, (c) =>
          c.query("update adhd_tracker.time_blocks set user_id = $2 where id = $1", [mine, b]),
        ),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
    });

    it("gives the anon role no access at all", async () => {
      await expect(
        as(pool, "anon", null, (c) => c.query("select * from adhd_tracker.time_blocks")),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
    });

    it("shows nothing to an authenticated request without a user id", async () => {
      const a = await createUser(pool);
      await insertBlock(pool, a, "2026-01-15T09:00Z", "2026-01-15T10:00Z");
      const rows = await as(pool, "authenticated", null, async (c) => {
        const r = await c.query("select id from adhd_tracker.time_blocks");
        return r.rows;
      });
      expect(rows).toEqual([]);
    });
  });

  describe("profiles", () => {
    it("are created for every new auth user with the defaults", async () => {
      const a = await createUser(pool);
      const { rows } = await pool.query(
        "select timezone, rest_days, evening_review_enabled from adhd_tracker.profiles where id = $1",
        [a],
      );
      expect(rows).toEqual([
        { timezone: "Europe/Madrid", rest_days: [6, 0], evening_review_enabled: true },
      ]);
    });

    it("can be read and edited only by their owner", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      const result = await asUser(pool, a, async (c) => {
        const visible = await c.query("select id from adhd_tracker.profiles");
        const own = await c.query(
          "update adhd_tracker.profiles set timezone = 'America/New_York' where id = $1",
          [a],
        );
        const other = await c.query(
          "update adhd_tracker.profiles set timezone = 'Asia/Tokyo' where id = $1",
          [b],
        );
        return { visible: visible.rows.map((r) => r.id), own: own.rowCount, other: other.rowCount };
      });
      expect(result).toEqual({ visible: [a], own: 1, other: 0 });
    });

    it("cannot be created for someone else", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      await expect(
        asUser(pool, a, (c) => c.query("insert into adhd_tracker.profiles (id) values ($1)", [b])),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });
    });

    it("cannot be created by calling the trigger function directly", async () => {
      const { rows } = await pool.query(
        `select r.rolname, has_function_privilege(r.rolname, 'adhd_tracker.handle_new_user()', 'execute') as can
         from pg_roles r where r.rolname in ('anon', 'authenticated') order by r.rolname`,
      );
      expect(rows).toEqual([
        { rolname: "anon", can: false },
        { rolname: "authenticated", can: false },
      ]);
    });
  });

  describe("insights_cache", () => {
    it("lets a user upsert their own cached insight (insert, then update on conflict)", async () => {
      const a = await createUser(pool);
      const upsert = (content: string) =>
        asUser(pool, a, (c) =>
          c.query(
            `insert into adhd_tracker.insights_cache (user_id, scope, for_date, content)
             values ($1, 'today', '2026-01-15', $2)
             on conflict (user_id, scope, for_date) do update set content = excluded.content`,
            [a, content],
          ),
        );
      await upsert("first");
      await upsert("second");
      const { rows } = await pool.query(
        "select content from adhd_tracker.insights_cache where user_id = $1",
        [a],
      );
      expect(rows).toEqual([{ content: "second" }]);
    });

    it("lets a user invalidate only their own cache", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      for (const u of [a, b]) {
        await pool.query(
          `insert into adhd_tracker.insights_cache (user_id, scope, for_date, content)
           values ($1, 'week', '2026-01-12', 'x')`,
          [u],
        );
      }
      const deleted = await asUser(pool, a, async (c) => {
        const r = await c.query("delete from adhd_tracker.insights_cache");
        return r.rowCount;
      });
      expect(deleted).toBe(1);
      const { rows } = await pool.query(
        "select count(*)::int as n from adhd_tracker.insights_cache where user_id = $1",
        [b],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  describe("reviews", () => {
    it("can only be written by the server, and answered only by their owner", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      await pool.query(
        "insert into adhd_tracker.reviews (user_id, for_date, summary) values ($1, '2026-01-15', 's')",
        [b],
      );

      await expect(
        asUser(pool, a, (c) =>
          c.query(
            "insert into adhd_tracker.reviews (user_id, for_date, summary) values ($1, '2026-01-16', 's')",
            [a],
          ),
        ),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });

      const answered = await asUser(pool, a, async (c) => {
        const r = await c.query(
          "update adhd_tracker.reviews set user_response = 'ok' where user_id = $1",
          [b],
        );
        return r.rowCount;
      });
      expect(answered).toBe(0);
    });

    it("can be answered by their owner", async () => {
      const a = await createUser(pool);
      await pool.query(
        "insert into adhd_tracker.reviews (user_id, for_date, summary) values ($1, '2026-01-15', 's')",
        [a],
      );
      const answered = await asUser(pool, a, async (c) => {
        const r = await c.query(
          "update adhd_tracker.reviews set user_response = 'skip' where user_id = $1",
          [a],
        );
        return r.rowCount;
      });
      expect(answered).toBe(1);
    });
  });

  describe("tables with a single `for all` policy", () => {
    for (const [table, insert] of [
      ["week_words", "insert into adhd_tracker.week_words (user_id, week_start, word) values ($1, '2026-01-12', 'w')"],
      [
        "week_summaries",
        "insert into adhd_tracker.week_summaries (user_id, week_start, summary) values ($1, '2026-01-12', 's')",
      ],
    ] as const) {
      it(`${table}: rejects a row written for another user`, async () => {
        const a = await createUser(pool);
        const b = await createUser(pool);
        await expect(asUser(pool, a, (c) => c.query(insert, [b]))).rejects.toMatchObject({
          code: PG.insufficientPrivilege,
        });
        await expect(asUser(pool, a, (c) => c.query(insert, [a]))).resolves.toBeDefined();
      });

      it(`${table}: hides, and refuses to change or delete, another user's row`, async () => {
        const a = await createUser(pool);
        const b = await createUser(pool);
        await pool.query(insert, [b]);
        const result = await asUser(pool, a, async (c) => {
          const seen = await c.query(`select id from adhd_tracker.${table}`);
          const moved = await c.query(
            `update adhd_tracker.${table} set week_start = '2026-01-19' where user_id = $1`,
            [b],
          );
          const deleted = await c.query(`delete from adhd_tracker.${table} where user_id = $1`, [b]);
          return [seen.rowCount, moved.rowCount, deleted.rowCount];
        });
        expect(result).toEqual([0, 0, 0]);
      });
    }
  });

  describe("push_subscriptions", () => {
    const upsert = `insert into adhd_tracker.push_subscriptions (user_id, endpoint, p256dh, auth)
                    values ($1, $2, $3, 'auth-secret')
                    on conflict (endpoint) do update
                    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;

    it("lets a browser re-subscribe and refresh its keys", async () => {
      const a = await createUser(pool);
      const endpoint = `https://push.example.test/${a}`;
      await asUser(pool, a, (c) => c.query(upsert, [a, endpoint, "key-1"]));
      await asUser(pool, a, (c) => c.query(upsert, [a, endpoint, "key-2"]));
      const { rows } = await pool.query(
        "select p256dh from adhd_tracker.push_subscriptions where endpoint = $1",
        [endpoint],
      );
      expect(rows).toEqual([{ p256dh: "key-2" }]);
    });

    it("does not let another user take over an existing endpoint", async () => {
      const a = await createUser(pool);
      const b = await createUser(pool);
      const endpoint = `https://push.example.test/${a}`;
      await asUser(pool, a, (c) => c.query(upsert, [a, endpoint, "key-a"]));

      await expect(
        asUser(pool, b, (c) => c.query(upsert, [b, endpoint, "key-b"])),
      ).rejects.toMatchObject({ code: PG.insufficientPrivilege });

      const { rows } = await pool.query(
        "select user_id, p256dh from adhd_tracker.push_subscriptions where endpoint = $1",
        [endpoint],
      );
      expect(rows).toEqual([{ user_id: a, p256dh: "key-a" }]);
    });
  });
});
