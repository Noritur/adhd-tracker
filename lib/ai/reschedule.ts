import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import {
  buildReschedulePrompt,
  type ExistingBlockLite,
  type RescheduleMoveItem,
} from "./prompts";
import { runWithFallback } from "./model-chain";

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

export async function generateReschedule(
  toMove: RescheduleMoveItem[],
  keep: ExistingBlockLite[],
  profile: Profile | null,
  ymd: string,
  tz: string,
  nowHHMM: string,
  userText: string,
  weekday: number | null = null,
): Promise<RescheduleResult | null> {
  const prompt = buildReschedulePrompt(
    toMove,
    keep,
    profile,
    ymd,
    tz,
    nowHHMM,
    userText,
    weekday,
  );
  return runWithFallback({
    schema: RescheduleSchema,
    prompt,
    logKey: "ai.reschedule",
    logContext: { to_move: toMove.length, keep: keep.length },
  });
}
