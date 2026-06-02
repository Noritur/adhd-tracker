import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import {
  buildPlannerPrompt,
  type ExistingBlockLite,
} from "./prompts";
import { runWithFallback } from "./model-chain";

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

export async function generatePlan(
  userText: string,
  profile: Profile | null,
  existing: ExistingBlockLite[],
  ymd: string,
  tz: string,
  weekday: number | null = null,
): Promise<Plan | null> {
  const prompt = buildPlannerPrompt(
    userText,
    profile,
    existing,
    ymd,
    tz,
    weekday,
  );
  const result = await runWithFallback({
    schema: PlannerSchema,
    prompt,
    logKey: "ai.planner",
    logContext: { existing_count: existing.length },
  });
  if (result) {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "ai.planner.blocks_generated",
        n: result.blocks.length,
      }),
    );
  }
  return result;
}
