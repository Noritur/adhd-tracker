import type { Block } from "@/lib/db/blocks";
import { isRestWeekday, type Profile } from "@/lib/db/profile";
import { CATEGORIES, CATEGORIES_BY_VALUE, type Category } from "@/lib/categories";
import { formatDuration } from "@/lib/time/slots";
import { getHHMMInTZ, getYMDInTZ } from "@/lib/time/tz";
import { COACH_VOICE } from "./master-prompt";

const WEEKDAY_NAMES_RU = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

/**
 * Returns prompt block describing rest-day context.
 * Empty string on workdays — no noise in the prompt.
 */
function restDayContext(profile: Profile | null, weekday: number): string {
  const isRest = isRestWeekday(profile, weekday);
  const dayName = WEEKDAY_NAMES_RU[weekday];
  if (!isRest) {
    return `день недели: ${dayName} (рабочий день для меня).`;
  }
  return `день недели: ${dayName} — это МОЙ ВЫХОДНОЙ.
важно: на выходных я не должен быть продуктивным. отсутствие фокус-блоков — это норма, а не провал.
- НЕ ругай за "пустой день" или отсутствие работы.
- НЕ толкай к фокус-сессиям если я сам не просил.
- отдых, прогулки, social, движение, побут — это и есть смысл выходного.
- если я говорю что хочу что-то поделать — окей, но в lighter режиме: меньше structure, больше "не упустить кайф".
- review/insights на выходном: фокус на восстановлении, а не на счётчике сделанного.`;
}

export type InsightScope = "today" | "week";

export type ExistingBlockLite = {
  start: string; // "HH:MM"
  end: string;
  category: string;
  label: string | null;
};

function blockDurationMin(b: Block): number {
  return (
    Math.max(
      0,
      new Date(b.end_at).getTime() - new Date(b.start_at).getTime(),
    ) / 60_000
  );
}

function summarizeByCategory(blocks: Block[]): string {
  if (blocks.length === 0) return "ничего не залогано";
  const totals: Partial<Record<Category, number>> = {};
  for (const b of blocks) {
    totals[b.category] = (totals[b.category] ?? 0) + blockDurationMin(b);
  }
  return (Object.entries(totals) as [Category, number][])
    .sort(([, a], [, b]) => b - a)
    .map(
      ([cat, min]) =>
        `• ${CATEGORIES_BY_VALUE[cat].label}: ${formatDuration(Math.round(min))}`,
    )
    .join("\n");
}

function summarizeTimeline(blocks: Block[], tz: string): string {
  if (blocks.length === 0) return "";
  return blocks
    .slice() // copy
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    )
    .map((b) => {
      // TZ-aware: render time as it appears in user's profile timezone,
      // not the server/Vercel TZ (which was usually UTC and shifted the
      // AI's view of the day by hours).
      const startHHMM = getHHMMInTZ(new Date(b.start_at), tz);
      const endHHMM = getHHMMInTZ(new Date(b.end_at), tz);
      const cat = CATEGORIES_BY_VALUE[b.category].label;
      const label = b.label ? ` — ${b.label}` : "";
      const mood =
        b.mood === "fire"
          ? " [энергия: на подъёме]"
          : b.mood === "ok"
            ? " [энергия: норм]"
            : b.mood === "swamp"
              ? " [энергия: тяжело/болото]"
              : "";
      return `${startHHMM}-${endHHMM} ${cat}${label}${mood}`;
    })
    .join("\n");
}

function summarizeByDay(blocks: Block[], tz: string): string {
  if (blocks.length === 0) return "ничего не залогано";
  const byDay: Record<string, Partial<Record<Category, number>>> = {};
  for (const b of blocks) {
    // TZ-aware day bucket: previously `toISOString().split("T")[0]` put
    // late-night local blocks under the next UTC day, scrambling weekly
    // insight per-day rows.
    const day = getYMDInTZ(new Date(b.start_at), tz);
    byDay[day] = byDay[day] ?? {};
    byDay[day][b.category] =
      (byDay[day][b.category] ?? 0) + blockDurationMin(b);
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, totals]) => {
      const parts = (Object.entries(totals) as [Category, number][])
        .sort(([, a], [, b]) => b - a)
        .map(
          ([cat, min]) =>
            `${CATEGORIES_BY_VALUE[cat].label} ${formatDuration(Math.round(min))}`,
        )
        .join(", ");
      return `${day}: ${parts}`;
    })
    .join("\n");
}

export function buildInsightPrompt(
  scope: InsightScope,
  blocks: Block[],
  profile: Profile | null = null,
  weekday: number | null = null,
  tz: string = "UTC",
): string {
  if (scope === "today") {
    const summary = summarizeByCategory(blocks);
    const timeline = summarizeTimeline(blocks, tz);
    const rest = weekday !== null ? restDayContext(profile, weekday) : "";
    return `${COACH_VOICE}

---

контекст: смотри на мой сегодняшний день в трекере.
${rest ? `\n${rest}\n` : ""}
общие итоги по категориям:
${summary}

таймлайн сегодня:
${timeline || "(пусто)"}

всего блоков: ${blocks.length}

твоя задача дать мне:
1. observation — короткий инсайт по тому что ты видишь в моем сегодняшнем ритме. что я избегаю, что повторяется, где есть энергия или провал. одной-двумя фразами. без faq-вступлений.
2. recommendation — один четкий совет или задача на остаток дня. конкретное действие или вопрос. не общая мудрость.

помни tone of voice: только строчные, живо, остро, без шаблонов.`;
  }

  // week scope
  const summary = summarizeByCategory(blocks);
  const byDay = summarizeByDay(blocks, tz);
  return `${COACH_VOICE}

---

контекст: смотри на мой последний 7-дневный период в трекере.

итоги по категориям за неделю:
${summary}

разбивка по дням:
${byDay}

всего блоков: ${blocks.length}

твоя задача дать мне:
1. observation — короткий инсайт по тенденциям за неделю. где паттерн, что я повторяю или избегаю, как идет энергия по дням. одной-двумя фразами.
2. recommendation — один четкий совет на следующую неделю. конкретное направление, не общие слова.

помни tone of voice: только строчные, живо, остро, без шаблонов.`;
}

export type RescheduleMoveItem = {
  ref: number; // stable index — AI must return this back
  category: string;
  label: string | null;
  durationMin: number;
};

export function buildReschedulePrompt(
  toMove: RescheduleMoveItem[],
  keep: ExistingBlockLite[],
  profile: Profile | null,
  ymd: string,
  tz: string,
  nowHHMM: string,
  userText: string,
  weekday: number | null = null,
): string {
  const workStart = (profile?.work_hours_start ?? "09:00:00").slice(0, 5);
  const workEnd = (profile?.work_hours_end ?? "18:00:00").slice(0, 5);
  const tone = profile?.ai_tone ?? "gentle";
  const rest = weekday !== null ? restDayContext(profile, weekday) : "";

  const keepText =
    keep.length === 0
      ? "(пусто)"
      : keep
          .map((e) => {
            const cat =
              CATEGORIES_BY_VALUE[e.category as Category]?.label ?? e.category;
            return `${e.start}-${e.end} ${cat}${e.label ? ` — ${e.label}` : ""}`;
          })
          .join("\n");

  const moveText = toMove
    .map((m) => {
      const cat = CATEGORIES_BY_VALUE[m.category as Category]?.label ?? m.category;
      return `ref=${m.ref}: ${cat}${m.label ? ` — ${m.label}` : ""}, ${m.durationMin} мин`;
    })
    .join("\n");

  return `${COACH_VOICE}

---

контекст: мой план на сегодня сломался. помоги перекинуть оставшееся на остаток дня. честно и реалистично.

сегодня: ${ymd}
часовой пояс: ${tz}
сейчас: ${nowHHMM}
рабочие часы: ${workStart}-${workEnd}
тон: ${tone === "firm" ? "жесткий, прямой" : "мягкий, заботливый, но честный"}
${rest ? `\n${rest}\n` : ""}

это уже прошло / трогать НЕЛЬЗЯ (обходи):
${keepText}

я говорю:
${userText || "(без комментария)"}

нужно перепланировать эти блоки (сохрани каждый, верни тот же ref):
${moveText}

правила:
- начинай НЕ раньше ${nowHHMM} (то что прошло — уже не вернуть)
- верни массив, по одному объекту на каждый ref выше, тот же ref
- start, end: "HH:MM" 24h, локальное время
- НЕ пересекайся с блоками которые трогать нельзя
- focus (coded/work_other) максимум 50 мин подряд; между двумя focus минимум 15 мин не-focus
- если на остаток дня всё не влезает честно — НЕ впихивай. лучше скажи в note что не помещается и расставь приоритетное. блок который не влез — верни с теми же ref но пометь "drop": true
- учитывай мой adhd и энергию: не громозди тяжелое в конец

формат — строго JSON по схеме. note (1-2 фразы, по делу) — что ты сделал и что пришлось вырезать. tone of voice: строчные, прямо.`;
}

export function buildReviewPrompt(
  profile: Profile | null,
  blocks: Block[],
  weekday: number | null = null,
  tz: string = "UTC",
): string {
  const tone = profile?.ai_tone ?? "gentle";
  const summary = summarizeByCategory(blocks);
  const timeline = summarizeTimeline(blocks, tz);
  const rest = weekday !== null ? restDayContext(profile, weekday) : "";

  return `${COACH_VOICE}

---

контекст: день закончился. это вечернее ревью. посмотри как прошел мой день в трекере.

тон: ${tone === "firm" ? "жесткий, прямой, можешь ругнуть за откладывание" : "мягкий, заботливый, но честный"}
${rest ? `\n${rest}\n` : ""}
итоги по категориям:
${summary}

таймлайн:
${timeline || "(пусто)"}

всего блоков: ${blocks.length}

твоя задача — два поля:
1. summary — короткое отражение дня (2-3 фразы). что я реально сделал, на что потратился, чего избегал. без faq-вступлений. без "сегодня ты..." — пиши как другу.
2. recommendation — один четкий совет или вопрос на завтра. конкретное действие или вопрос-крючок чтобы я задумался. не общая мудрость.

помни tone of voice: только строчные, живо, остро, без шаблонов.`;
}

export function buildWeekSummaryPrompt(
  profile: Profile | null,
  blocks: Block[],
  weekStart: string,
  tz: string = "UTC",
): string {
  const tone = profile?.ai_tone ?? "gentle";
  const summary = summarizeByCategory(blocks);
  const byDay = summarizeByDay(blocks, tz);

  return `${COACH_VOICE}

---

контекст: неделя закончилась (с понедельника ${weekStart}). это итог недели — якорь памяти, к которому я вернусь через месяцы. не совет на будущее, а честный слепок: что это была за неделя.

тон: ${tone === "firm" ? "жесткий, прямой" : "мягкий, заботливый, но честный"}

итоги по категориям за неделю:
${summary}

разбивка по дням:
${byDay}

всего блоков: ${blocks.length}

твоя задача — summary: наративный итог недели в 3-4 фразы. что реально вышло, какие паттерны (по дням, по энергии), какой был ритм и настроение. пиши как другу, без faq-вступлений, без "на этой неделе ты...". это память — будь конкретным (какие дни, какие категории всплывали), чтобы через время это что-то значило.

выходные — норма отдыха, не провал, не считай их пустыми. помни tone of voice: только строчные, живо, остро, без шаблонов.`;
}

export function buildWeekAdvicePrompt(args: {
  profile: Profile | null;
  weekSummary: string;
  userNote: string;
  pastWeeks: {
    weekStart: string;
    summary: string;
    userNote: string | null;
    advice: string | null;
  }[];
}): string {
  const { profile, weekSummary, userNote, pastWeeks } = args;
  const tone = profile?.ai_tone ?? "gentle";

  const memory =
    pastWeeks.length === 0
      ? "(пока пусто — это первая рефлексия)"
      : pastWeeks
          .map((w) => {
            const note = w.userNote ? `\n  моя заметка: ${w.userNote}` : "";
            const adv = w.advice ? `\n  что ты советовал: ${w.advice}` : "";
            return `• неделя с ${w.weekStart}: ${w.summary}${note}${adv}`;
          })
          .join("\n");

  return `${COACH_VOICE}

---

контекст: конец недели, я делаю рефлексию. у тебя есть ДОЛГАЯ ПАМЯТЬ по моим неделям — пользуйся ей, связывай с паттернами.

тон: ${tone === "firm" ? "жесткий, прямой" : "мягкий, заботливый, но честный"}

твои мысли по этой неделе (ты их уже написал):
${weekSummary}

что я сам говорю про свое состояние за неделю:
${userNote}

память — прошлые недели (твои мысли + мои заметки + что ты советовал):
${memory}

твоя задача — advice: дай совет и инсайты с опорой НА МОЙ ВВОД и на то что ты помнишь о прошлых неделях. свяжи с паттернами (что повторяется неделя к неделе, что меняется, где застреваю или расту). 3-5 фраз, конкретно, как другу. без faq-вступлений, без общей мудрости. tone of voice: только строчные, живо, остро.`;
}

export function buildPlannerPrompt(
  userText: string,
  profile: Profile | null,
  existing: ExistingBlockLite[],
  ymd: string,
  tz: string,
  weekday: number | null = null,
): string {
  const workStart = (profile?.work_hours_start ?? "09:00:00").slice(0, 5);
  const workEnd = (profile?.work_hours_end ?? "18:00:00").slice(0, 5);
  const tone = profile?.ai_tone ?? "gentle";
  const rest = weekday !== null ? restDayContext(profile, weekday) : "";

  const existingText =
    existing.length === 0
      ? "(пусто)"
      : existing
          .map((e) => {
            const cat =
              CATEGORIES_BY_VALUE[e.category as Category]?.label ?? e.category;
            return `${e.start}-${e.end} ${cat}${e.label ? ` — ${e.label}` : ""}`;
          })
          .join("\n");

  const catList = CATEGORIES.map((c) => `${c.value} (${c.label})`).join(", ");

  return `${COACH_VOICE}

---

контекст: я говорю тебе что мне сегодня надо. ты помогаешь распланировать день в блоки времени.

сегодня: ${ymd}
часовой пояс: ${tz}
рабочие часы: ${workStart}-${workEnd}
тон: ${tone === "firm" ? "жесткий, прямой, ругаешь за хаос" : "мягкий, заботливый, но честный"}
${rest ? `\n${rest}\n` : ""}

уже есть блоки на сегодня (НЕ ТРОГАЙ, ОБХОДИ):
${existingText}

я говорю:
${userText}

твоя задача — верни план блоков на сегодня:
- start, end: "HH:MM" в местном времени, 24h формат
- category: одно из [${catList}]
- label: короткий ярлык на украинском или русском (3-5 слов), или null
- каждый блок минимум 15 минут
- НЕ пересекайся с уже существующими блоками сверху
- учитывай рабочие часы для coded/work_other
- между блоками оставляй буферы где разумно (15-30 мин)
- не планируй плотнее реальности — лучше меньше блоков но честно
- ЖЕСТКОЕ ПРАВИЛО: focus-блок (coded или work_other) НЕ длиннее 50 минут.
  нужно больше — делай несколько focus-блоков по <=50 мин.
- ЖЕСТКОЕ ПРАВИЛО: между любыми двумя focus-блоками минимум 15 минут
  не-focus (rest / outdoors / chores / что угодно кроме coded и work_other).
- учитывай мой adhd: после фокус-сессии — обязательно отдых или прогулка

также можешь добавить короткое поле note (одна фраза, коучская) — если есть что сказать о плане, иначе null.

формат — строго JSON по схеме. tone of voice: только строчные, живо, прямо.`;
}
