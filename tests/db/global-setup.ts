import { readdirSync, readFileSync } from "node:fs";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

const DB_NAME = "adhd_test";
const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
const BOOTSTRAP = new URL("./bootstrap.sql", import.meta.url);

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string | null;
  }
}

/**
 * Recreates a scratch database and replays every migration from git into it.
 * TEST_DATABASE_URL points at any database on a server we may create
 * databases on; the tests themselves only touch `adhd_test`.
 */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    if (process.env.REQUIRE_DB === "1") {
      const message = "REQUIRE_DB=1 but TEST_DATABASE_URL is not set";
      // Printed as well, because the startup error's own text can get lost
      // while Vite formats its stack trace.
      console.error(message);
      throw new Error(message);
    }
    project.provide("dbUrl", null);
    return;
  }

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${DB_NAME}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(readFileSync(BOOTSTRAP, "utf8"));
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      try {
        await db.query(readFileSync(new URL(file, MIGRATIONS), "utf8"));
      } catch (e) {
        throw new Error(`migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }

  project.provide("dbUrl", url.toString());
}
