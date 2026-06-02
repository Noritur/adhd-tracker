import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Block } from "@/lib/db/blocks";
import type { Profile } from "@/lib/db/profile";
import { buildReviewPrompt } from "./prompts";

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

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

export async function generateReview(
  profile: Profile | null,
  blocks: Block[],
  weekday: number | null = null,
): Promise<AiReview | null> {
  if (blocks.length === 0) return null;

  const prompt = buildReviewPrompt(profile, blocks, weekday);
  let lastError: unknown = null;

  for (const modelId of MODEL_CHAIN) {
    try {
      const result = await generateObject({
        model: google(modelId),
        schema: ReviewSchema,
        prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "ai.review.ok",
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
          msg: "ai.review.model_failed",
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai.review.exhausted",
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  return null;
}
