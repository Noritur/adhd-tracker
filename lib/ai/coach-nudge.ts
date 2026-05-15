import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import type { Profile } from "@/lib/db/profile";
import { COACH_VOICE } from "./master-prompt";

export type NudgeKind = "swamp_streak" | "focus_no_break";

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

const SITUATION: Record<NudgeKind, string> = {
  swamp_streak:
    "два блока подряд он отметил как болото — энергия на нуле, что-то идёт не так. не бодрись фальшиво, помоги остановиться и честно посмотреть что происходит.",
  focus_no_break:
    "он отработал два focus-блока подряд без паузы. перегрев близко. толкни оторваться на 15 минут — без морали, по-дружески но твёрдо.",
};

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
      const { text } = await generateText({
        model: google(modelId),
        prompt,
      });
      const line = text.trim().replace(/^["']|["']$/g, "").slice(0, 140);
      if (line) {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "ai.coach_nudge.ok",
            model: modelId,
            kind,
          }),
        );
        return line;
      }
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
  return null;
}
