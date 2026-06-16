import { z } from "zod";
import type { Block } from "@/lib/db/blocks";
import type { Profile } from "@/lib/db/profile";
import { buildWeekSummaryPrompt } from "./prompts";
import { runWithFallback } from "./model-chain";

export const WeekSummarySchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(1200)
    .describe("наративный итог недели 3-4 фразы, строчными, как якорь памяти"),
});

export type AiWeekSummary = z.infer<typeof WeekSummarySchema>;

/**
 * Frozen narrative recap of a week — a memory anchor, not the ephemeral
 * observation+recommendation of week-insight. Generated Sunday evening on
 * the review cron rails and stored permanently (feeds future coach memory).
 */
export async function generateWeekSummary(
  profile: Profile | null,
  blocks: Block[],
  weekStart: string,
  tz: string = "UTC",
): Promise<AiWeekSummary | null> {
  if (blocks.length === 0) return null;
  const prompt = buildWeekSummaryPrompt(profile, blocks, weekStart, tz);
  return runWithFallback({
    schema: WeekSummarySchema,
    prompt,
    logKey: "ai.week_summary",
    logContext: { blocks: blocks.length, week: weekStart },
  });
}
