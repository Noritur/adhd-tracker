import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    // Same `@/*` mapping as tsconfig.json. A regex, so "@ai-sdk/..." and
    // other scoped packages are left alone.
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/db/global-setup.ts"],
          // Every file shares one database; run them one after another.
          fileParallelism: false,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
