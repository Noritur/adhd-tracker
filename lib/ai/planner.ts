import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import {
  buildPlannerPrompt,
  type ExistingBlockLite,
} from "./prompts";

export const PlannerSchema = z.object({
  blocks: z
    .array(
      z.object({
        start: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .describe("HH:MM, 24h"),
        end: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .describe("HH:MM, 24h"),
        category: z.enum([
          "coded",
          "work_other",
          "sport",
          "outdoors",
          "social",
          "rest",
          "chores",
          "other",
        ]),
        label: z.string().nullable(),
      }),
    )
    .max(20),
  note: z.string().nullable(),
});

export type Plan = z.infer<typeof PlannerSchema>;

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

export async function generatePlan(
  userText: string,
  profile: Profile | null,
  existing: ExistingBlockLite[],
  ymd: string,
  tz: string,
): Promise<Plan | null> {
  const prompt = buildPlannerPrompt(userText, profile, existing, ymd, tz);
  let lastError: unknown = null;

  for (const modelId of MODEL_CHAIN) {
    try {
      const result = await generateObject({
        model: google(modelId),
        schema: PlannerSchema,
        prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "ai.planner.ok",
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
          msg: "ai.planner.model_failed",
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai.planner.exhausted",
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  return null;
}
