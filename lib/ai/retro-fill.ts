import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Profile } from "@/lib/db/profile";
import { COACH_VOICE } from "./master-prompt";
import { CATEGORIES } from "@/lib/categories";

export const RetroFillSchema = z.object({
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

export type RetroFill = z.infer<typeof RetroFillSchema>;

const MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

function buildRetroFillPrompt(
  userText: string,
  ymd: string,
  tz: string,
  profile: Profile | null,
): string {
  const workStart = (profile?.work_hours_start ?? "09:00:00").slice(0, 5);
  const workEnd = (profile?.work_hours_end ?? "18:00:00").slice(0, 5);
  const catList = CATEGORIES.map((c) => `${c.value} (${c.label})`).join(", ");

  return `${COACH_VOICE}

---

контекст: я пропустив день і не заповнив трекер. зараз описую постфактум як пройшов цей день. допоможи розкласти по блокам.

дата: ${ymd}
часовой пояс: ${tz}
рабочие часы: ${workStart}-${workEnd}

я описую:
${userText}

твоя задача — реконструировать день в блоки:
- start, end: "HH:MM" в местном времени, 24h формат
- category: одно из [${catList}]
- label: короткий ярлык (3-5 слов), или null
- каждый блок минимум 15 минут
- будь реалистичным: не выдумывай чего человек не сказал
- если он говорит "работал с утра до обеда" — это один большой блок, не разбивай без нужды
- если непонятно время — угадывай разумно по рабочим часам
- между блоками можешь оставлять пустоты (не обязательно покрывать весь день)
- ЖЕСТКОЕ ПРАВИЛО: focus-блок (coded или work_other) НЕ длиннее 50 минут. нужно больше — разбей на несколько + 15 мин пауза между ними
- note: одна фраза от тренера про этот день (по делу, не формальность). или null.

формат — строго JSON по схеме. tone of voice: строчные, живо.`;
}

export async function generateRetroFill(
  userText: string,
  ymd: string,
  tz: string,
  profile: Profile | null,
): Promise<RetroFill | null> {
  const prompt = buildRetroFillPrompt(userText, ymd, tz, profile);
  let lastError: unknown = null;

  for (const modelId of MODEL_CHAIN) {
    try {
      const result = await generateObject({
        model: google(modelId),
        schema: RetroFillSchema,
        prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "ai.retro_fill.ok",
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
          msg: "ai.retro_fill.model_failed",
          model: modelId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai.retro_fill.exhausted",
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  );
  return null;
}
