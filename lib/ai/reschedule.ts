import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import {
  buildReschedulePrompt,
  type ExistingBlockLite,
  type RescheduleMoveItem,
} from "./prompts";

export const RescheduleSchema = z.object({
  blocks: z
    .array(
      z.object({
        ref: z.number().int(),
        start: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .describe("HH:MM 24h"),
        end: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .describe("HH:MM 24h"),
        drop: z.boolean().nullable(),
      }),
    )
    .max(40),
  note: z.string().nullable(),
});

export type RescheduleResult = z.infer<typeof RescheduleSchema>;

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

export async function generateReschedule(
  toMove: RescheduleMoveItem[],
  keep: ExistingBlockLite[],
  profile: Profile | null,
  ymd: string,
  tz: string,
  nowHHMM: string,
  userText: string,
): Promise<RescheduleResult | null> {
  const prompt = buildReschedulePrompt(
    toMove,
    keep,
    profile,
    ymd,
    tz,
    nowHHMM,
    userText,
  );
  let lastError: unknown = null;

  for (const modelId of MODEL_CHAIN) {
    try {
      const result = await generateObject({
        model: google(modelId),
        schema: RescheduleSchema,
        prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "ai.reschedule.ok",
          model: modelId,
          n: result.object.blocks.length,
        }),
      );
      return result.object;
    } catch (e) {
      lastError = e;
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "ai.reschedule.model_failed",
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai.reschedule.exhausted",
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  return null;
}
