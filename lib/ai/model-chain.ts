/**
 * Single source of truth for the Gemini model fallback chain.
 *
 * Every AI module used to repeat the same try/catch loop over MODEL_CHAIN
 * with copy-pasted structured logging. `runWithFallback` collapses that
 * into one helper so log shape, error handling, and model order stay
 * consistent across planner/insights/reschedule/review/retro-fill.
 *
 * Coach-nudge keeps its own loop (per-iteration blocklist + canned
 * fallback), but imports MODEL_CHAIN from here to share the constant.
 */

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import type { z } from "zod";

export const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

/** Extra structured fields included in every log line for an attempt. */
export type LogContext = Record<string, string | number | boolean | null>;

export type RunWithFallbackOpts<T> = {
  /** Zod schema for the structured output. */
  schema: z.ZodType<T>;
  /** Fully-built prompt string (COACH_VOICE + context + task). */
  prompt: string;
  /**
   * Base log key, e.g. "ai.planner". The helper emits:
   * - `${logKey}.ok`            on success (level: info)
   * - `${logKey}.model_failed`  on per-model failure (level: warn)
   * - `${logKey}.exhausted`     when all models fail (level: error)
   */
  logKey: string;
  /** Extra fields included in every log line (model, blocks count, etc.). */
  logContext?: LogContext;
};

/**
 * Try each model in MODEL_CHAIN in order. Returns the first successful
 * structured output, or null if every model failed (validation or API).
 *
 * Caller is responsible for any post-processing (length cap, content
 * safety filter, etc.) — this helper only owns the chain and logging.
 */
export async function runWithFallback<T>({
  schema,
  prompt,
  logKey,
  logContext = {},
}: RunWithFallbackOpts<T>): Promise<T | null> {
  let lastError: unknown = null;
  for (const modelId of MODEL_CHAIN) {
    try {
      const result = await generateObject({
        model: google(modelId),
        schema,
        prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: `${logKey}.ok`,
          model: modelId,
          ...logContext,
        }),
      );
      return result.object;
    } catch (e) {
      lastError = e;
      console.error(
        JSON.stringify({
          level: "warn",
          msg: `${logKey}.model_failed`,
          model: modelId,
          ...logContext,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
  console.error(
    JSON.stringify({
      level: "error",
      msg: `${logKey}.exhausted`,
      ...logContext,
      error:
        lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  return null;
}
