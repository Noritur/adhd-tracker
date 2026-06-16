import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import type { WeekSummary } from "@/lib/db/week-summaries";
import { buildWeekAdvicePrompt } from "./prompts";
import { runWithFallback } from "./model-chain";

export const WeekAdviceSchema = z.object({
  advice: z
    .string()
    .min(1)
    .max(1500)
    .describe(
      "совет и инсайты на основе моего ввода и памяти прошлых недель, строчными",
    ),
});

export type AiWeekAdvice = z.infer<typeof WeekAdviceSchema>;

/**
 * Weekly reflection advice: coach reacts to the user's note about their week,
 * leaning on long-term memory (past weeks' summaries + notes + advice).
 * Non-streaming, reuses the same Gemini fallback chain as the rest.
 */
export async function generateWeekAdvice(args: {
  profile: Profile | null;
  weekSummary: string;
  userNote: string;
  pastWeeks: WeekSummary[];
}): Promise<AiWeekAdvice | null> {
  const { profile, weekSummary, userNote, pastWeeks } = args;
  const prompt = buildWeekAdvicePrompt({
    profile,
    weekSummary,
    userNote,
    pastWeeks: pastWeeks.map((w) => ({
      weekStart: w.week_start,
      summary: w.summary,
      userNote: w.user_note,
      advice: w.advice,
    })),
  });
  return runWithFallback({
    schema: WeekAdviceSchema,
    prompt,
    logKey: "ai.week_advice",
    logContext: { pastWeeks: pastWeeks.length },
  });
}
