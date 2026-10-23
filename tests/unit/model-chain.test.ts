import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject }));
vi.mock("@ai-sdk/google", () => ({ google: (modelId: string) => ({ modelId }) }));

const { MODEL_CHAIN, runWithFallback } = await import("@/lib/ai/model-chain");

const schema = z.object({ line: z.string() });
const opts = { schema, prompt: "say hi", logKey: "ai.test" };

function modelsTried(): string[] {
  return generateObject.mock.calls.map(([args]) => args.model.modelId);
}

beforeEach(() => {
  generateObject.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("runWithFallback", () => {
  it("returns the first model's answer and stops there", async () => {
    generateObject.mockResolvedValueOnce({ object: { line: "hi" } });
    await expect(runWithFallback(opts)).resolves.toEqual({ line: "hi" });
    expect(modelsTried()).toEqual([MODEL_CHAIN[0]]);
  });

  it("falls through to the next model when one fails", async () => {
    generateObject
      .mockRejectedValueOnce(new Error("429 quota"))
      .mockResolvedValueOnce({ object: { line: "from the second" } });
    await expect(runWithFallback(opts)).resolves.toEqual({ line: "from the second" });
    expect(modelsTried()).toEqual([MODEL_CHAIN[0], MODEL_CHAIN[1]]);
  });

  it("returns null after every model failed, trying them in chain order", async () => {
    generateObject.mockRejectedValue(new Error("503 overloaded"));
    await expect(runWithFallback(opts)).resolves.toBeNull();
    expect(modelsTried()).toEqual([...MODEL_CHAIN]);
  });

  it("passes the schema and prompt through unchanged", async () => {
    generateObject.mockResolvedValueOnce({ object: { line: "ok" } });
    await runWithFallback(opts);
    const [args] = generateObject.mock.calls[0];
    expect(args.schema).toBe(schema);
    expect(args.prompt).toBe("say hi");
  });
});
