import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, inject } from "vitest";

export const dbUrl = inject("dbUrl");

/** One pool per test file, closed when the file is done. */
export function usePool(): Pool {
  const pool = new Pool({ connectionString: dbUrl ?? undefined, max: 6 });
  afterAll(() => pool.end());
  return pool;
}

type Role = "anon" | "authenticated" | "service_role";

/**
 * Runs `fn` in one transaction as `role`, the way PostgREST runs a request:
 * `set local role` plus the JWT claims that auth.uid() reads. Commits on
 * success, rolls back and rethrows on error.
 */
export async function as<T>(
  pool: Pool,
  role: Role,
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    const claims = userId ? JSON.stringify({ sub: userId, role }) : "";
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export const asUser = <T>(pool: Pool, userId: string, fn: (c: PoolClient) => Promise<T>) =>
  as(pool, "authenticated", userId, fn);

/** A new auth user; the handle_new_user trigger gives it a profile row. */
export async function createUser(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@example.test`]);
  return id;
}

/** Inserts a block as the table owner (no RLS) and returns its id. */
export async function insertBlock(
  pool: Pool,
  userId: string,
  start: string,
  end: string,
  category = "rest",
): Promise<number> {
  const { rows } = await pool.query(
    `insert into adhd_tracker.time_blocks (user_id, start_at, end_at, category)
     values ($1, $2, $3, $4) returning id`,
    [userId, start, end, category],
  );
  return Number(rows[0].id);
}

/** Resolves once backend `pid` is waiting on a lock held by someone else. */
export async function waitUntilBlocked(pool: Pool, pid: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const { rows } = await pool.query(
      "select wait_event_type from pg_stat_activity where pid = $1",
      [pid],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`backend ${pid} never blocked on a lock`);
}

export async function backendPid(client: PoolClient): Promise<number> {
  const { rows } = await client.query("select pg_backend_pid() as pid");
  return rows[0].pid;
}

/** Postgres error codes the tests assert on. */
export const PG = {
  exclusionViolation: "23P01",
  checkViolation: "23514",
  insufficientPrivilege: "42501",
} as const;
