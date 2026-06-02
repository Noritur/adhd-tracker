import { z } from "zod";
import type { Block } from "@/lib/db/blocks";
import type { Profile } from "@/lib/db/profile";
import { buildReviewPrompt } from "./prompts";
import { runWithFallback } from "./model-chain";

export const ReviewSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(800)
    .describe("2-3 фразы про прошедший день, строчными"),
  recommendation: z
    .string()
    .min(1)
    .max(500)
    .describe("один совет или вопрос на завтра, строчными"),
});

export type AiReview = z.infer<typeof ReviewSchema>;

export async function generateReview(
  profile: Profile | null,
  blocks: Block[],
  weekday: number | null = null,
  tz: string = "UTC",
): Promise<AiReview | null> {
  if (blocks.length === 0) return null;
  const prompt = buildReviewPrompt(profile, blocks, weekday, tz);
  return runWithFallback({
    schema: ReviewSchema,
    prompt,
    logKey: "ai.review",
    logContext: { blocks: blocks.length },
  });
}
