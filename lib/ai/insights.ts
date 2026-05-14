import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Block } from "@/lib/db/blocks";
import { buildInsightPrompt, type InsightScope } from "./prompts";

export const InsightSchema = z.object({
  observation: z
    .string()
    .min(1)
    .max(800)
    .describe("короткий инсайт, 1-2 фразы, строчными"),
  recommendation: z
    .string()
    .min(1)
    .max(500)
    .describe("один четкий совет или задача, строчными"),
});

export type Insight = z.infer<typeof InsightSchema>;

// Fallback chain — if primary model 503/quota, retry with smaller.
const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

export async function generateInsight(
  scope: InsightScope,
  blocks: Block[],
): Promise<Insight | null> {
  if (blocks.length === 0) return null;

  const prompt = buildInsightPrompt(scope, blocks);
  let lastError: unknown = null;

  for (const modelId of MODEL_CHAIN) {
    try {
      const result = await generateObject({
        model: google(modelId),
        schema: InsightSchema,
        prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "ai.insight.ok",
          scope,
          model: modelId,
          blocks: blocks.length,
        }),
      );
      return result.object;
    } catch (e) {
      lastError = e;
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "ai.insight.model_failed",
          scope,
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai.insight.exhausted",
      scope,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  return null;
}
