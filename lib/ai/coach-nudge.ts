import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import { COACH_VOICE } from "./master-prompt";
import { MODEL_CHAIN } from "./model-chain";

export type NudgeKind = "swamp_streak" | "focus_no_break";

const SITUATION: Record<NudgeKind, string> = {
  swamp_streak:
    "два блока подряд он отметил как болото — энергия на нуле, что-то идёт не так. не бодрись фальшиво, помоги остановиться и честно посмотреть что происходит.",
  focus_no_break:
    "он отработал два focus-блока подряд без паузы. перегрев близко. толкни оторваться на 15 минут — без морали, по-дружески но твёрдо.",
};

/**
 * Hard safety blocklist. The coach-voice persona is intentionally raw
 * ("будь реален", "лол нет"), which gives the model wide latitude. Most
 * Gemini guardrails block self-harm output already, but we add a thin
 * regex net so a hallucination can never reach a user's push notification.
 *
 * Tuned for false-negatives over false-positives — if it trips, we fall
 * back to a canned line. False-trips on legit content are cheap.
 */
const HARM_BLOCKLIST =
  /\b(suicide|kill\s*your\s*self|kys|hurt\s*your\s*self|self[\s-]?harm|убей\s*себя|убий\s*себе|самоубийст|самогубств|harm\s*yourself|вбий\s*себе)\b/i;

/** Canned fallbacks used when AI returns blocked content or empty output. */
const FALLBACK_LINE: Record<NudgeKind, string> = {
  swamp_streak:
    "стоп. вийди на 10 хв, попий води, повернись. без героїзму.",
  focus_no_break:
    "15 хв перерва обов'язкова. встав, видихни, тільки потім далі.",
};

const NudgeSchema = z.object({
  line: z
    .string()
    .min(1)
    .max(140)
    .describe(
      "одна коротка фраза-пинок, ~110 символов max, строчными, без кавычек, без приветствия",
    ),
});

/** One short coach-voice line for a real-time proactive push. */
export async function generateCoachNudge(
  kind: NudgeKind,
  profile: Profile | null,
): Promise<string | null> {
  const tone = profile?.ai_tone ?? "gentle";
  const prompt = `${COACH_VOICE}

---

ты замечаешь прямо сейчас, в реальном времени, по трекеру:
${SITUATION[kind]}

тон: ${tone === "firm" ? "жёстко, прямо" : "мягко, но честно"}

напиши РОВНО одну короткую фразу-пинок (максимум ~110 символов), своим голосом, строчными, без приветствий и без кавычек. чтобы он завис на секунду и среагировал.`;

  for (const modelId of MODEL_CHAIN) {
    try {
      const { object } = await generateObject({
        model: google(modelId),
        schema: NudgeSchema,
        prompt,
      });
      const cleaned = object.line
        .trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 140);

      // Empty / whitespace-only output — try next model.
      if (!cleaned) continue;

      // Hard safety net — if the model produces self-harm content, fall
      // back to a canned line rather than skipping the push (user still
      // gets the nudge they needed; just with safer phrasing).
      if (HARM_BLOCKLIST.test(cleaned)) {
        console.error(
          JSON.stringify({
            level: "warn",
            msg: "ai.coach_nudge.blocked",
            model: modelId,
            kind,
          }),
        );
        return FALLBACK_LINE[kind];
      }

      console.log(
        JSON.stringify({
          level: "info",
          msg: "ai.coach_nudge.ok",
          model: modelId,
          kind,
        }),
      );
      return cleaned;
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "ai.coach_nudge.model_failed",
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
  // All models exhausted — return null so the caller can decide whether
  // to skip the push entirely (vs sending a generic fallback every time
  // gemini is down, which would dilute the nudge value).
  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai.coach_nudge.exhausted",
      kind,
    }),
  );
  return null;
}
