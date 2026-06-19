# adhd-tracker

AI-коуч для людей з ADHD-патерном, який живе у таймлайні твого дня.

**Production:** https://adhd-tracker-nine.vercel.app

---

## Проблема

Існуючі трекери часу (Toggl, Clockify, Pomodoro-таймери) побудовані для нейротипічних людей: "запусти таймер, зупини таймер". Для ADHD-мозку це не працює:

- **Time-blindness** -- відчуття часу порушене, 50-хвилинна focus-сесія суб'єктивно = 15 хвилин
- **Decision paralysis** -- ранок починається з "що робити?" і закінчується скролінгом
- **Hyperfocus trap** -- 3 години без перерви, потім повний crash
- **Plan collapse** -- план зламався о 14:00, весь день здається втраченим

Потрібен не таймер, а AI-партнер, який бачить патерни, нагадує вчасно і допомагає реструктурувати день коли все пішло не за планом.

## Що робить

Веб-додаток з вертикальним таймлайном дня (drag-and-drop, 1px = 1 хвилина) і вісьмома AI-точками взаємодії:

**Timeline CRUD** -- tap створює блок; tap по блоку -> режим редагування з overhanging-ручками (resize) і чистою move-зоною. drag-to-move штовхає сусідні блоки (cascade push вгору і вниз, Sunsama-style), drag-to-resize з 15-хв snap. Overlap protection на рівні DB (exclusion constraint) і клієнта. 8 категорій з кольоровою палітрою.

**Morning planner** -- "що сьогодні треба?" -> AI розкладає блоки по таймлайну, обходить існуючі, враховує робочі години і anti-burnout правила. Блоки створюються одразу, не як "рекомендації".

**Inline insights** -- AI-коуч аналізує залоговане (today або week scope) і дає observation + recommendation. Cache 2 години. Не FAQ-відповіді -- конкретні патерни з твоїх даних.

**Adaptive reschedule** -- натискаєш "план зламався", AI бере всі блоки після поточного часу, перепаковує на залишок дня з коментарем що не влізло. keep/toMove split, focus-правила re-validated server-side.

**Rebuild day** -- "забудь план, починаємо з нуля". Видаляє всі майбутні блоки сьогодні (а не всю tomorrow!) ATOMIC: тільки після успіху AI. Якщо AI впав → твій день недоторканий.

**Retro fill** -- пропустив день? Відкрий `/day/2025-05-31`, опиши текстом, AI реконструює блоки минулого дня з focus-правилами і TZ-aware часом.

**Proactive coaching push** -- кожну хвилину cron перевіряє блоки: якщо два "болото" підряд або два focus без перерви, AI генерує one-liner пінок з content-safety фільтром і надсилає Web Push на телефон. Atomic claim перед AI-викликом — race-safe проти duplicate cron firings.

**Word of the week** -- episodic-memory anchor: у п'ятницю AI шле push "яке слово цього тижня?". Зберігається один short phrase per (user, week), показується hero-текстом при перегляді минулих тижнів.

**Weekly digest** -- у неділю ввечері (на тих самих cron-рейках що й evening review) AI пише наративний підсумок тижня: що вийшло, патерни по днях, настрій. Застиглий snapshot-anchor per (user, week) -- на відміну від ефемерних insights, не регенериться, а лягає в довготривалу пам'ять коуча.

**Weekly reflection loop** -- під дайджестом лишаєш один інпут про свій стан за тиждень. AI відповідає порадами й інсайтами, спираючись на твій інпут плюс пам'ять усіх попередніх тижнів (їхні дайджести + твої нотатки + минулі поради). Інпут і відповідь зберігаються й годують наступні тижні -- коуч пам'ятає, як минали твої тижні й місяці, і зв'язує патерни в часі.

**Rest days** -- вибираєш у `/settings` які дні тижня — вихідні. У ці дні AI tone адаптується: не тисне на продуктивність, не нагнітає "де твої фокус-блоки?", вечірнє ревью фокусується на відновленні.

**Evening review** -- Vercel Cron о 19:00 UTC, AI пише summary дня + рекомендацію на завтра, шле push-нотифікацію з прев'ю.

**Mood 1-tap** -- блоки без оцінки з'являються як картка, 3 кнопки (fire / ok / swamp). Mood feed-иться в AI prompts як `[энергия: ...]`.

**/week heatmap** -- 7 днів x 6 4-годинних слотів, домінантна категорія per cell з opacity = totalMinutes/240. Динамічні summary tiles (рендеряться лише категорії, наявні в розкладі -- без zero-noise), weekly digest + reflection зверху.

**Anti-burnout rules** -- focus (coded/work_other) hard-cap 50 хвилин, мінімум 15 хвилин non-focus gap між focus-блоками. Enforced скрізь: manual create, drag, planner, reschedule.

**PWA + Web Push** -- installable на homescreen, VAPID push нотифікації, service worker. Іконка "р" amber на dark.

**Liquid-glass UI** -- V2 restyle: aurora-фон за кожним екраном, backdrop-blur glass-chrome на хедерах і навігації, glass-light на картках/інпутах/чипах. Mobile-first dark, safe-area-aware (notch + home indicator).

---

## AI-архітектура

### Master-prompt persona

Всі 8 AI-точок ділять один голос коуча -- `lib/ai/master-prompt.ts`. Це не system prompt-шаблон, а авторська персона: lowercase, без формальностей, прямий зворотний зв'язок, "будь реален" замість corporate advice. Зміна тону (firm/gentle) в `/settings` впливає на інструкцію тону, але голос залишається тим самим.

Кожен use-case (`lib/ai/prompts.ts`) компонує промпт як:

```
COACH_VOICE (persona)
---
context (today blocks, mood, category totals, timeline)
---
task-specific instructions + output schema description
```

### Model fallback chain

```
gemini-2.5-flash  ->  gemini-2.5-flash-lite  ->  gemini-2.0-flash
   primary              fallback on 503           last resort
```

Три моделі по низхідній якості. Кожен AI-модуль (`insights.ts`, `reschedule.ts`, `coach-nudge.ts`, `review.ts`, `planner.ts`) ітерує ланцюжок, ловить помилки, логує у structured JSON. Якщо все три fail -- graceful null, UI показує fallback стан.

### Structured output

AI SDK `generateObject` з zod-схемами для типобезпечного парсингу:

| Touchpoint | Output schema | SDK method |
|---|---|---|
| Insights | `{ observation, recommendation }` | `generateObject` |
| Morning planner | `{ blocks: [{ start, end, category, label }], note }` | `generateObject` |
| Evening review | `{ summary, recommendation }` | `generateObject` |
| Adaptive reschedule | `{ blocks: [{ ref, start, end, drop }], note }` | `generateObject` |
| Retro fill (past day) | same shape as planner | `generateObject` |
| Proactive nudge | `{ line: z.string().max(140) }` + HARM_BLOCKLIST + canned fallback | `generateObject` |
| Weekly digest | `{ summary }` -- наративний підсумок тижня | `generateObject` |
| Weekly reflection advice | `{ advice }` -- на основі інпуту + памʼяті тижнів | `generateObject` |

Fallback chain (`gemini-2.5-flash` → `flash-lite` → `2.0-flash`) and log shape (`level/msg/model/error`) extracted into single `runWithFallback<T>({ schema, prompt, logKey, logContext })` helper used by all eight touchpoints — one source of truth.

### Proactive coaching loop

```
cron-job.org (every 1 min)
    |
    POST /api/block-tick  (Bearer auth)
    |
    +-- query: blocks starting now (<=2 min window)
    |       -> send "block started" push
    |
    +-- query: blocks ending in ~5 min
    |       -> send "ending soon" push
    |
    +-- query: last 2 completed blocks
            -> swamp_streak? (2x mood=swamp)
            -> focus_no_break? (2x focus, <15min gap)
                -> atomic claim profiles.last_proactive_at (race-safe gate)
                -> AI generateObject -> one-liner nudge (140-char, content-filtered)
                -> Web Push (canned fallback if blocklist hit)
```

Block-started / block-ending pushes use the same pattern: atomic claim on `time_blocks.notified_*_at` *before* sending so two overlapping cron invocations can't both fire the push. Loser of the race gets `[]` from the UPDATE and skips cleanly.

### Cron schedule (all external)

| Route | Schedule | Why external |
|---|---|---|
| `/api/block-tick` | every 1 min | Vercel Hobby = daily cron only; need minute-level for block reminders |
| `/api/morning-nudge` | every 1 hour at `:00` | Daily cron at fixed UTC time can only honor one timezone. Hourly + ±30min user-time window covers every IANA TZ the settings form exposes |
| `/api/review` | every 1 hour at `:00` | Same: daily 19:00 UTC was unreachable for non-Europe users despite a configurable `evening_review_at` setting |

All three jobs are configured at [cron-job.org](https://cron-job.org) (free, external HTTP POST). Each is a regular function invocation — Vercel cron quota isn't touched. Idempotency:

- `block-tick` → atomic claim on `time_blocks.notified_*_at` and `profiles.last_proactive_at` (see "Proactive coaching loop" above)
- `morning-nudge` → atomic claim on `profiles.last_morning_nudge_at` (per-day local)
- `review` → uniqueness on `(user_id, for_date)` in `reviews` table. Той самий hourly tick несе ще два TZ-gated проходи: п'ятничний word-of-week nudge і недільний weekly digest (`week_summaries`, unique on `(user_id, week_start)`)

So even if cron-job.org retries on transient failure or two ticks land in the same minute, no user gets duplicate review/nudge/coach. Trade-off: dependency on external service, free tier suspends jobs on non-2xx responses.

`vercel.json` no longer declares any crons.

### Cache strategy

Insights cache в `adhd_tracker.insights_cache` з 2-годинним TTL. Cache key: `(user_id, scope, for_date)`. На stale → AI generation → upsert через `onConflict: "user_id,scope,for_date"` (race-safe). Cache явно invalidate-иться з усіх write-шляхів (block CRUD, mood, retro-fill, profile-update) — без цього юзер бачив би до 2h pre-write coaching попри revalidatePath.

### Longitudinal memory (weekly)

Окремо від 2-годинного insights-кешу — довготривала пам'ять коуча по тижнях. Кожен тиждень = рядок у `adhd_tracker.week_summaries`:

- **summary** — наративний дайджест, який AI пише сам у неділю (Sunday loop у `/api/review`, той самий TZ-window що й evening review).
- **user_note** — мій інпут про стан за тиждень.
- **advice** — поради, які AI генерує у відповідь на інпут.

Коли я лишаю тижневу рефлексію, `generateWeekAdvice` тягне до 8 попередніх тижнів (`getWeekSummariesForRange`) і складає їх — дайджести + мої нотатки + минулі поради — у промпт. Так коуч зв'язує патерни в часі ("те саме болото третій тиждень підряд"), а не реагує лише на сьогодні. Пам'ять наростає сама: кожна рефлексія стає контекстом для наступних. Без чату й стрімінгу — асинхронний тижневий цикл на наявних cron-рейках.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, React 19) |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix) |
| Database | Supabase Postgres, custom schema `adhd_tracker`, RLS |
| Auth | Supabase Auth (magic link + password), custom SMTP (Resend) |
| AI | Vercel AI SDK 6 + `@ai-sdk/google` (direct Gemini, not Gateway) |
| Push | Web Push API + `web-push` (VAPID), service worker |
| Hosting | Vercel (Fluid Compute) |
| Cron | cron-job.org (all external): 1-min block-tick, hourly morning-nudge + review/digest |
| Language | TypeScript, pnpm |

### Чому не...

**...AI Gateway?** Direct Gemini = менше latency, free tier 60 RPM / 1500 req/day вистачає для self-use. Gateway додає hop. Swap на Gateway -- одна зміна в import.

**...react-big-calendar / FullCalendar?** Бібліотеки -- overkill для single-day vertical timeline. Custom component з pointer events дає повний контроль над touch UX (ADHD-critical: мінімум кроків для дії).

**...Tremor для heatmap?** Спробували -- data shape не підходить для category-dominant heatmap. Custom component, 50 рядків.

---

## Структура проєкту

```
app/
  today/           -- timeline view + morning planner + mood check
  week/            -- weekly heatmap + summary tiles + digest + reflection loop
  settings/        -- profile, work hours, AI tone, push toggle
  api/
    review/        -- Vercel Cron, evening review for all users
    morning-nudge/ -- Vercel Cron, morning push (per-day atomic claim)
    block-tick/    -- external cron, minute-level reminders + coaching
  day/[date]/      -- past-day archive + retro-fill (AI reconstructs missed day)

lib/
  ai/
    master-prompt  -- coach persona (shared across all AI calls)
    prompts        -- prompt builders (insight, plan, review, reschedule, week-summary, week-advice) + rest-day context
    model-chain    -- runWithFallback<T>(schema, prompt, logKey) — single source for fallback + logging
    apply-plan     -- applyPlanBlocks(): shared planner+rebuild insert logic
    insights       -- thin wrapper, generateObject via runWithFallback
    planner        -- morning plan generation
    review         -- evening review generation
    reschedule     -- adaptive reschedule
    retro-fill     -- past-day reconstruction from text
    coach-nudge    -- proactive one-liner with HARM_BLOCKLIST + canned fallback
    week-summary   -- weekly digest generation (Sunday cron)
    week-advice    -- weekly reflection advice (input + longitudinal memory)
    cache          -- insights cache (2h TTL, upsert + invalidate)
  rules/
    focus-limits   -- 50min cap + 15min gap validation (shared everywhere)
  db/
    blocks         -- time_blocks CRUD + deleteFutureBlocksInDay (today-bounded)
    profile        -- user profile (TZ, work hours, AI tone, rest_days, idempotency timestamps)
    reviews        -- evening review storage
    week-words     -- episodic-memory anchor per week
    week-summaries -- weekly digest + reflection (note + advice), longitudinal memory
    push-subscriptions -- Web Push subscriptions, auto-clean 404/410
  push/
    send           -- VAPID push delivery
  time/
    tz             -- per-user timezone helpers (Intl.DateTimeFormat-based)
    slots          -- 15-min snap math, formatting, TZ-aware iso<->minutes helpers
  supabase/
    client / server / admin / middleware
```

## Data model

7 таблиць у schema `adhd_tracker`:

- **profiles** -- timezone, work_hours, ai_tone (firm/gentle), evening_review config, `rest_days int[]` (weekday indices treated as days off), `last_proactive_at` + `last_morning_nudge_at` (per-day atomic-claim idempotency).
- **time_blocks** -- user_id, start_at, end_at, category, label, mood (fire/ok/swamp), notify flags. Exclusion constraint через `btree_gist` для overlap protection.
- **insights_cache** -- per-user per-scope per-date, 2h TTL. Has SELECT / INSERT / UPDATE / DELETE policies so user-session client can upsert + invalidate.
- **reviews** -- evening review summary + recommendation, user_response (ok/skip/not_today)
- **week_words** -- one short phrase per (user, week_start) — episodic-memory anchor displayed when browsing past weeks.
- **week_summaries** -- per (user, week_start): AI `summary` (недільний дайджест) + `user_note` (моя тижнева рефлексія) + `advice` (поради коуча). Довготривала пам'ять для weekly reflection-циклу.
- **push_subscriptions** -- Web Push endpoints, unique on endpoint, auto-cleaned on 404/410.

RLS на всіх таблицях: `auth.uid() = user_id`. Service-role client для cron routes. `handle_new_user()` trigger має EXECUTE revoked from PUBLIC (тільки auth trigger).

---

## Design decisions для ADHD

**1px = 1 хвилина.** Фізичний розмір блока = тривалість. Time-blind мозок "бачить" час через простір.

**Tap-to-create, не форма.** Тапнув на порожній слот -> одразу sheet з категорією. Мінімум кроків до дії.

**Focus cap 50 хвилин.** Не Pomodoro (25 -- занадто мало для deep work з ADHD). 50 хвилин -- compromise між hyperfocus trap і продуктивністю. Enforced скрізь, не optional.

**"План зламався" замість "видали все і почни заново".** Reschedule зберігає id/mood/label кожного блока, AI тільки перерозподіляє час. Нічого не втрачається.

**Mood -- 3 опції, не шкала.** Fire / ok / swamp. Для ADHD шкала 1-10 = decision paralysis. Три кнопки = 0.5 сек.

**Coach, не assistant.** AI не питає "чим можу допомогти?". Він дивиться на дані і каже що бачить. Proactive, не reactive.

**Зовнішня пам'ять по тижнях.** ADHD = слабка автобіографічна пам'ять на патерни ("чи завжди середа провальна?", "коли востаннє був рівний тиждень?"). Тижневі дайджести + рефлексії стають зовнішньою памʼяттю, яку коуч читає за тебе і зв'язує в часі -- замість того щоб ти тримав це в голові.

---

## Розгортання локально

```bash
git clone https://github.com/Noritur/adhd-tracker.git
cd adhd-tracker
pnpm install

# .env.local (see .env.example for full list)
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# GOOGLE_GENERATIVE_AI_API_KEY=...
# CRON_SECRET=...
# NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:...

pnpm dev
```

Supabase: потрібен проєкт з exposed schema `adhd_tracker`, custom SMTP для magic link (Supabase default = 4 emails/hour). Schema, RLS policies, grants, trigger та btree_gist exclusion constraint версіонуються у `supabase/migrations/` — `supabase db push` після `supabase link` накатує все на чистий проєкт.

---

## Свідомі trade-offs

| Що | Чому | Альтернатива |
|---|---|---|
| Direct Gemini, not Gateway | Free tier, менше latency, швидше ship | AI Gateway (one import change) |
| cron-job.org для block-tick | Vercel Hobby = daily cron only. Потрібна хвилинна гранулярність | Vercel Pro ($20/mo) або self-hosted cron |
| Custom SMTP (Resend) | Supabase default SMTP = 4 emails/hour project-wide | Supabase Pro plan |
| Mobile-only dark UI | 80% використання з телефону, ADHD = менше вибору = менше friction | Responsive + light theme |
| Coach voice hardcoded (RU) | Self-dogfooding product, один користувач | i18n, per-user voice config |

---

## Roadmap

- [ ] Telegram bot як notification channel (reuse python-telegram-bot з попереднього проєкту)
- [ ] ActivityWatch integration для автоматичного логування screen time
- [ ] GCal import (блоки з календаря як read-only overlay)
- [ ] Demo account з seed data (recruiter заходить -> не порожньо)
- [ ] Light theme + responsive desktop layout
- [ ] Voice logging через Whisper

---

## Stats

- ~12 днів розробки + 2 тижні self-dogfood тест-фази (bug-log T1-T19, ~16 фіксів/фіч у проді)
- 8 AI touchpoints (planner, reschedule, insights, review, retro-fill, coach-nudge, weekly digest, weekly reflection advice), 3-model Gemini fallback chain
- `runWithFallback` + `applyPlanBlocks` helpers — 5 files share one chain implementation, 2 actions share one insert implementation
- Anti-burnout focus rules (50min cap + 15min gap) enforced via `validateFocusBlock` across manual edit / drag-resize / planner / reschedule / retro-fill
- Atomic push idempotency (claim-before-send for block start/end + coach + morning nudge)
- TZ-aware everywhere: prompts, timeline, NowLine, week buckets — all honor `profiles.timezone`, not server clock
- Insights cache bust on every write path (no 2h stale-coaching window after mood/block/profile changes)
- Longitudinal weekly memory: digests + reflections accumulate per week, fed into future coach advice (`getWeekSummariesForRange`)
- Liquid-glass V2 design system (aurora + backdrop-blur chrome + glass-light surfaces), safe-area-aware PWA
- 22 задокументованих blockers (Next.js 16, Supabase custom schema + RLS/grants, PWA auth, TZ math, npm bugs)
- Повністю self-dogfooded: проєкт будувався для власного ADHD-патерну

---

Built by [@mahtalaran](https://github.com/Noritur)
