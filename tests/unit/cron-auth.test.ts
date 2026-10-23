import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireCronAuth } from "@/lib/auth/cron";

const SECRET = "test-cron-secret-0123456789";

function requestWith(authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request("https://example.test/api/block-tick", { headers });
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requireCronAuth without a configured secret", () => {
  for (const [label, value] of [
    ["missing", undefined],
    ["empty", ""],
  ] as const) {
    it(`fails closed when CRON_SECRET is ${label}`, () => {
      vi.stubEnv("CRON_SECRET", value);
      // The strings an attacker would guess from `Bearer ${undefined}`.
      for (const guess of ["Bearer undefined", "Bearer ", "Bearer", undefined]) {
        const response = requireCronAuth(requestWith(guess));
        expect(response?.status, String(guess)).toBe(500);
      }
      expect(errorLog).toHaveBeenCalled();
    });
  }
});

describe("requireCronAuth with a secret", () => {
  beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));

  it("lets the right bearer token through", () => {
    expect(requireCronAuth(requestWith(`Bearer ${SECRET}`))).toBeNull();
  });

  it("rejects a missing, wrong or malformed header", () => {
    for (const header of [undefined, "", `Bearer ${SECRET}x`, SECRET, `bearer ${SECRET}`, `Basic ${SECRET}`]) {
      expect(requireCronAuth(requestWith(header))?.status, String(header)).toBe(401);
    }
  });

  it("logs neither the secret nor the presented token on a rejected request", () => {
    const logs = [
      errorLog,
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
    ];
    const guess = "Bearer guessed-token-abcdef";
    requireCronAuth(requestWith(guess));
    requireCronAuth(requestWith(`Bearer ${SECRET.slice(0, -1)}`));
    const logged = logs.flatMap((spy) => spy.mock.calls.flat()).map(String).join(" ");
    expect(logged).not.toContain(SECRET.slice(0, -1));
    expect(logged).not.toContain("guessed-token-abcdef");
  });
});
