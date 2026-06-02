import { z } from "zod";
import type { Block } from "@/lib/db/blocks";
import type { Profile } from "@/lib/db/profile";
import { buildInsightPrompt, type InsightScope } from "./prompts";
import { runWithFallback } from "./model-chain";

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

export async function generateInsight(
  scope: InsightScope,
  blocks: Block[],
  profile: Profile | null = null,
  weekday: number | null = null,
): Promise<Insight | null> {
  if (blocks.length === 0) return null;
  const prompt = buildInsightPrompt(scope, blocks, profile, weekday);
  return runWithFallback({
    schema: InsightSchema,
    prompt,
    logKey: "ai.insight",
    logContext: { scope, blocks: blocks.length },
  });
}
