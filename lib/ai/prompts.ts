import type { Block } from "@/lib/db/blocks";
import type { Profile } from "@/lib/db/profile";
import { CATEGORIES, CATEGORIES_BY_VALUE, type Category } from "@/lib/categories";
import {
  formatDuration,
  isoToLocalDayMinutes,
  formatTime,
} from "@/lib/time/slots";
import { COACH_VOICE } from "./master-prompt";

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

function summarizeTimeline(blocks: Block[]): string {
  if (blocks.length === 0) return "";
  return blocks
    .slice() // copy
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    )
    .map((b) => {
      const startMin = isoToLocalDayMinutes(b.start_at);
      const endMin = isoToLocalDayMinutes(b.end_at);
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
      return `${formatTime(startMin)}-${formatTime(endMin)} ${cat}${label}${mood}`;
    })
    .join("\n");
}

function summarizeByDay(blocks: Block[]): string {
  if (blocks.length === 0) return "ничего не залогано";
  const byDay: Record<string, Partial<Record<Category, number>>> = {};
  for (const b of blocks) {
    const day = new Date(b.start_at).toISOString().split("T")[0];
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
): string {
  if (scope === "today") {
    const summary = summarizeByCategory(blocks);
    const timeline = summarizeTimeline(blocks);
    return `${COACH_VOICE}

---

контекст: смотри на мой сегодняшний день в трекере.

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
  const byDay = summarizeByDay(blocks);
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
): string {
  const workStart = (profile?.work_hours_start ?? "09:00:00").slice(0, 5);
  const workEnd = (profile?.work_hours_end ?? "18:00:00").slice(0, 5);
  const tone = profile?.ai_tone ?? "gentle";

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
): string {
  const tone = profile?.ai_tone ?? "gentle";
  const summary = summarizeByCategory(blocks);
  const timeline = summarizeTimeline(blocks);

  return `${COACH_VOICE}

---

контекст: день закончился. это вечернее ревью. посмотри как прошел мой день в трекере.

тон: ${tone === "firm" ? "жесткий, прямой, можешь ругнуть за откладывание" : "мягкий, заботливый, но честный"}

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

export function buildPlannerPrompt(
  userText: string,
  profile: Profile | null,
  existing: ExistingBlockLite[],
  ymd: string,
  tz: string,
): string {
  const workStart = (profile?.work_hours_start ?? "09:00:00").slice(0, 5);
  const workEnd = (profile?.work_hours_end ?? "18:00:00").slice(0, 5);
  const tone = profile?.ai_tone ?? "gentle";

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
