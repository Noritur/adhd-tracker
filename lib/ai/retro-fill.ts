import { z } from "zod";
import { isRestWeekday, type Profile } from "@/lib/db/profile";
import { COACH_VOICE } from "./master-prompt";
import { CATEGORIES } from "@/lib/categories";
import { runWithFallback } from "./model-chain";

const WEEKDAY_NAMES_RU = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

/** Weekday (0=Sun..6=Sat) for a YMD string interpreted as a calendar date. */
function weekdayForYMD(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

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

function buildRetroFillPrompt(
  userText: string,
  ymd: string,
  tz: string,
  profile: Profile | null,
): string {
  const workStart = (profile?.work_hours_start ?? "09:00:00").slice(0, 5);
  const workEnd = (profile?.work_hours_end ?? "18:00:00").slice(0, 5);
  const catList = CATEGORIES.map((c) => `${c.value} (${c.label})`).join(", ");
  const weekday = weekdayForYMD(ymd);
  const dayName = WEEKDAY_NAMES_RU[weekday];
  const isRest = isRestWeekday(profile, weekday);
  const restBlock = isRest
    ? `\nэто был МОЙ ВЫХОДНОЙ (${dayName}). не вытягивай "фокус" если человек его не упомянул. отдых, прогулки, social — норма выходного.\n`
    : `\nдень недели: ${dayName} (рабочий).\n`;

  return `${COACH_VOICE}

---

контекст: я пропустив день і не заповнив трекер. зараз описую постфактум як пройшов цей день. допоможи розкласти по блокам.

дата: ${ymd}
часовой пояс: ${tz}
рабочие часы: ${workStart}-${workEnd}
${restBlock}

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
  return runWithFallback({
    schema: RetroFillSchema,
    prompt,
    logKey: "ai.retro_fill",
    logContext: { ymd },
  });
}
