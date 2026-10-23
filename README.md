# adhd-tracker

[![ci](https://github.com/Noritur/adhd-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Noritur/adhd-tracker/actions/workflows/ci.yml)

An AI coach for people with an ADHD pattern — one that lives inside the timeline of your day.

**Production:** https://adhd-tracker-nine.vercel.app

---

## The problem

Existing time trackers (Toggl, Clockify, Pomodoro timers) are built for neurotypical people: "start a timer, stop a timer." For an ADHD brain that doesn't work:

- **Time blindness** — the sense of time is broken; a 50-minute focus session subjectively feels like 15
- **Decision paralysis** — the morning starts with "what do I do?" and ends in scrolling
- **Hyperfocus trap** — three hours with no break, then a full crash
- **Plan collapse** — the plan broke at 2pm, so the whole day feels lost

What's needed isn't a timer but an AI partner that sees patterns, reminds you on time, and helps restructure the day when everything goes off the rails.

## What it does

A web app built around a vertical timeline of the day (drag-and-drop, 1px = 1 minute) with eight AI touchpoints:

**Timeline CRUD** — tap creates a block; tapping a block enters edit mode with overhanging handles (resize) and a clean move zone. Drag-to-move pushes neighboring blocks (cascade push, up and down, Sunsama-style); drag-to-resize with a 15-min snap. Overlap protection at both the DB level (exclusion constraint) and the client. 8 color-coded categories.

**Morning planner** — "what do I need today?" → the AI lays blocks onto the timeline, works around existing ones, respects work hours and anti-burnout rules. Blocks are created immediately, not offered as "suggestions."

**Inline insights** — the AI coach analyzes what's logged (today or week scope) and returns an observation + recommendation. Cached for 2 hours. Not FAQ answers — concrete patterns from your own data.

**Adaptive reschedule** — hit "the plan broke," and the AI takes every block after the current time and repacks the rest of the day, with a note on what didn't fit. keep/toMove split, focus rules re-validated server-side.

**Rebuild day** — "forget the plan, start over." Deletes all *future* blocks for today (not all of tomorrow!). ATOMIC: only after the AI succeeds. If the AI fails, your day is untouched.

**Retro fill** — missed a day? Open `/day/2025-05-31`, describe it in text, and the AI reconstructs the blocks of that past day with focus rules and TZ-aware times.

**Proactive coaching push** — every minute a cron checks your blocks: if there are two "swamp" moods in a row or two focus blocks with no break, the AI generates a one-liner nudge (with a content-safety filter) and sends a Web Push to your phone. Atomic claim before the AI call — race-safe against duplicate cron firings.

**Word of the week** — an episodic-memory anchor: on Friday the AI pushes "what's the word for this week?". One short phrase is stored per (user, week) and shown as hero text when browsing past weeks.

**Weekly digest** — on Sunday evening (on the same cron rails as the evening review) the AI writes a narrative recap of the week: what got done, day-by-day patterns, mood. A frozen snapshot-anchor per (user, week) — unlike the ephemeral insights, it isn't regenerated; it settles into the coach's long-term memory.

**Weekly reflection loop** — under the digest you leave a single input about your state for the week. The AI responds with advice and insights, drawing on your input plus the memory of every previous week (their digests + your notes + past advice). Your input and the response are stored and feed future weeks — the coach remembers how your weeks and months went, and connects patterns over time.

**Rest days** — in `/settings` you pick which weekdays are days off. On those days the AI tone adapts: it doesn't push for productivity, doesn't nag "where are your focus blocks?", and the evening review centers on recovery.

**Evening review** — a cron job runs in the user's evening window; the AI writes a summary of the day + a recommendation for tomorrow and sends a push notification with a preview.

**Mood 1-tap** — unrated blocks surface as a card with three buttons (fire / ok / swamp). Mood is fed into AI prompts as `[energy: ...]`.

**/week heatmap** — 7 days × 6 four-hour slots, the dominant category per cell with opacity = totalMinutes/240. Dynamic summary tiles (only categories present in the schedule are rendered — no zero-noise), with the weekly digest + reflection on top.

**Anti-burnout rules** — focus blocks (coded/work_other) are hard-capped at 50 minutes, with a minimum 15-minute non-focus gap between focus blocks. Enforced everywhere: manual create, drag, planner, reschedule.

**PWA + Web Push** — installable to the home screen, VAPID push notifications, service worker. Amber "р" icon on dark.

**Liquid-glass UI** — a V2 restyle: an aurora background behind every screen, backdrop-blur glass-chrome on headers and navigation, glass-light on cards/inputs/chips. Mobile-first dark, safe-area aware (notch + home indicator).

---

## AI architecture

### Master-prompt persona

All 8 AI touchpoints share a single coach voice — `lib/ai/master-prompt.ts`. It's not a system-prompt template but an authored persona: lowercase, no formalities, direct feedback, "be real" instead of corporate advice. Changing the tone (firm/gentle) in `/settings` adjusts the tone instruction, but the voice stays the same.

Each use case (`lib/ai/prompts.ts`) composes the prompt as:

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

Three models in descending quality. Each AI module (`insights.ts`, `reschedule.ts`, `coach-nudge.ts`, `review.ts`, `planner.ts`) iterates the chain, catches errors, logs structured JSON. If all three fail — a graceful null, and the UI shows a fallback state.

### Structured output

AI SDK `generateObject` with zod schemas for type-safe parsing:

| Touchpoint | Output schema | SDK method |
|---|---|---|
| Insights | `{ observation, recommendation }` | `generateObject` |
| Morning planner | `{ blocks: [{ start, end, category, label }], note }` | `generateObject` |
| Evening review | `{ summary, recommendation }` | `generateObject` |
| Adaptive reschedule | `{ blocks: [{ ref, start, end, drop }], note }` | `generateObject` |
| Retro fill (past day) | same shape as planner | `generateObject` |
| Proactive nudge | `{ line: z.string().max(140) }` + HARM_BLOCKLIST + canned fallback | `generateObject` |
| Weekly digest | `{ summary }` — narrative recap of the week | `generateObject` |
| Weekly reflection advice | `{ advice }` — from the input + memory of past weeks | `generateObject` |

The fallback chain (`gemini-2.5-flash` → `flash-lite` → `2.0-flash`) and the log shape (`level/msg/model/error`) are extracted into a single `runWithFallback<T>({ schema, prompt, logKey, logContext })` helper used by all eight touchpoints — one source of truth.

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

Block-started / block-ending pushes use the same pattern: an atomic claim on `time_blocks.notified_*_at` *before* sending, so two overlapping cron invocations can't both fire the push. The loser of the race gets `[]` from the UPDATE and skips cleanly.

### Cron schedule (all external)

| Route | Schedule | Why external |
|---|---|---|
| `/api/block-tick` | every 1 min | Vercel Hobby = daily cron only; minute-level is needed for block reminders |
| `/api/morning-nudge` | every 1 hour at `:00` | A daily cron at a fixed UTC time can only honor one timezone. Hourly + a ±30-min user-time window covers every IANA TZ the settings form exposes |
| `/api/review` | every 1 hour at `:00` | Same: a daily 19:00 UTC job was unreachable for non-Europe users despite a configurable `evening_review_at` setting |

All three jobs are configured at [cron-job.org](https://cron-job.org) (free, external HTTP POST). Each is a regular function invocation — the Vercel cron quota isn't touched. Idempotency:

- `block-tick` → atomic claim on `time_blocks.notified_*_at` and `profiles.last_proactive_at` (see "Proactive coaching loop" above)
- `morning-nudge` → atomic claim on `profiles.last_morning_nudge_at` (per local day)
- `review` → uniqueness on `(user_id, for_date)` in the `reviews` table. The same hourly tick carries two more TZ-gated passes: the Friday word-of-week nudge and the Sunday weekly digest (`week_summaries`, unique on `(user_id, week_start)`)

So even if cron-job.org retries on a transient failure or two ticks land in the same minute, no user gets a duplicate review/nudge/coach. Trade-off: a dependency on an external service, whose free tier suspends jobs on non-2xx responses.

`vercel.json` no longer declares any crons.

### Cache strategy

Insights are cached in `adhd_tracker.insights_cache` with a 2-hour TTL. Cache key: `(user_id, scope, for_date)`. On stale → AI generation → upsert via `onConflict: "user_id,scope,for_date"` (race-safe). The cache is explicitly invalidated from every write path (block CRUD, mood, retro-fill, profile update) — without that a user would see up to 2h of pre-write coaching despite `revalidatePath`.

### Longitudinal memory (weekly)

Separate from the 2-hour insights cache is the coach's long-term memory across weeks. Each week is a row in `adhd_tracker.week_summaries`:

- **summary** — the narrative digest the AI writes itself on Sunday (the Sunday loop in `/api/review`, the same TZ window as the evening review).
- **user_note** — my input about how the week went.
- **advice** — the advice the AI generates in response to that input.

When I leave a weekly reflection, `generateWeekAdvice` pulls up to 8 previous weeks (`getWeekSummariesForRange`) and folds them — digests + my notes + past advice — into the prompt. That lets the coach connect patterns over time ("the same swamp for the third week running") instead of reacting only to today. The memory grows on its own: each reflection becomes context for the next. No chat, no streaming — an asynchronous weekly cycle on the existing cron rails.

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

### Why not...

**...AI Gateway?** Direct Gemini = lower latency, and the free tier (60 RPM / 1500 req/day) is plenty for self-use. The Gateway adds a hop. Swapping to it is a one-line import change.

**...react-big-calendar / FullCalendar?** Those libraries are overkill for a single-day vertical timeline. A custom component with pointer events gives full control over the touch UX (ADHD-critical: the fewest steps to an action).

**...Tremor for the heatmap?** Tried it — the data shape didn't fit a category-dominant heatmap. Custom component, 50 lines.

---

## Project structure

```
app/
  today/           -- timeline view + morning planner + mood check
  week/            -- weekly heatmap + summary tiles + digest + reflection loop
  settings/        -- profile, work hours, AI tone, push toggle
  api/
    review/        -- external cron, evening review + Friday word + Sunday digest
    morning-nudge/ -- external cron, morning push (per-day atomic claim)
    block-tick/    -- external cron, minute-level reminders + coaching
  day/[date]/      -- past-day archive + retro-fill (AI reconstructs a missed day)

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

7 tables in the `adhd_tracker` schema:

- **profiles** — timezone, work_hours, ai_tone (firm/gentle), evening_review config, `rest_days int[]` (weekday indices treated as days off), `last_proactive_at` + `last_morning_nudge_at` (per-day atomic-claim idempotency).
- **time_blocks** — user_id, start_at, end_at, category, label, mood (fire/ok/swamp), notify flags. Exclusion constraint via `btree_gist` for overlap protection.
- **insights_cache** — per-user per-scope per-date, 2h TTL. Has SELECT / INSERT / UPDATE / DELETE policies so the user-session client can upsert + invalidate.
- **reviews** — evening review summary + recommendation, user_response (ok/skip/not_today).
- **week_words** — one short phrase per (user, week_start); an episodic-memory anchor shown when browsing past weeks.
- **week_summaries** — per (user, week_start): AI `summary` (Sunday digest) + `user_note` (my weekly reflection) + `advice` (coach advice). Long-term memory for the weekly reflection loop.
- **push_subscriptions** — Web Push endpoints, unique on endpoint, auto-cleaned on 404/410.

RLS on every table: `auth.uid() = user_id`. A service-role client is used for cron routes. The `handle_new_user()` trigger has EXECUTE revoked from PUBLIC (auth trigger only).

---

## ADHD design decisions

**1px = 1 minute.** A block's physical size equals its duration. A time-blind brain "sees" time through space.

**Tap-to-create, not a form.** Tap an empty slot → a category sheet opens immediately. The fewest steps to an action.

**Focus cap of 50 minutes.** Not Pomodoro (25 is too short for ADHD deep work). 50 minutes is a compromise between the hyperfocus trap and productivity. Enforced everywhere, not optional.

**"The plan broke" instead of "delete everything and start over."** Reschedule keeps each block's id/mood/label; the AI only redistributes the time. Nothing is lost.

**Mood — 3 options, not a scale.** Fire / ok / swamp. A 1–10 scale is decision paralysis for ADHD. Three buttons = half a second.

**Coach, not assistant.** The AI doesn't ask "how can I help?". It looks at the data and says what it sees. Proactive, not reactive.

**External memory across weeks.** ADHD means weak autobiographical memory for patterns ("is Wednesday always a bust?", "when was the last steady week?"). Weekly digests + reflections become an external memory the coach reads for you and connects over time — instead of you holding it in your head.

---

## Local setup

```bash
git clone https://github.com/Noritur/adhd-tracker.git
cd adhd-tracker
pnpm install

# .env.local (see .env.example for the full list)
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

Supabase: you need a project with the `adhd_tracker` schema exposed and custom SMTP for magic links (Supabase's default is 4 emails/hour). The schema, RLS policies, grants, trigger, and the btree_gist exclusion constraint are versioned in `supabase/migrations/` — `supabase db push` after `supabase link` applies everything to a clean project.

---

## Testing

```bash
pnpm test        # unit tests; database tests are skipped when no database is set
pnpm db:test:up  # Postgres 17 in Docker on 127.0.0.1:5436
pnpm test:db     # replays supabase/migrations into a scratch database and runs the database tests
```

- **Unit:** timezone math (DST days in Madrid, negative offsets, week bounds), the drag cascade, free-slot search for the planner, the 50-minute focus cap, cron auth failing closed on a missing secret, the Gemini fallback chain (mocked, no network), proactive-nudge detection.
- **Database:** every file in `supabase/migrations/` is replayed on plain Postgres with a small stand-in for Supabase's roles and `auth.uid()`. The tests cover the no-overlap exclusion constraint (including two concurrent inserts), RLS on every table (own rows only, no writes on behalf of other users, no access for `anon`, no takeover of another user's push endpoint), the trigger function not being callable by API roles, and claim-before-send leaving exactly one winner when two cron runs overlap.
- **Replay vs. production:** `tests/db/schema-fingerprint.sql` hashes policies, grants, RLS flags, constraints, columns and function privileges. Run read-only on the replayed database and on the live project, it gives equal hashes, so the migrations in git describe what is deployed.
- **Known bugs** stay in the suite as `it.fails` tests named after the bug (for example T22, an hour's error in `localDateTimeToUTC` around DST switches), so the suite is green today and the test flips the day the bug is fixed.

CI runs lint, the type check and both test layers on every push.

---

## Deliberate trade-offs

| What | Why | Alternative |
|---|---|---|
| Direct Gemini, not Gateway | Free tier, lower latency, faster to ship | AI Gateway (one import change) |
| cron-job.org for block-tick | Vercel Hobby = daily cron only; minute-level granularity is needed | Vercel Pro ($20/mo) or self-hosted cron |
| Custom SMTP (Resend) | Supabase's default SMTP = 4 emails/hour project-wide | Supabase Pro plan |
| Mobile-only dark UI | 80% of use is from the phone; ADHD = fewer choices = less friction | Responsive + light theme |
| Coach voice hardcoded (RU) | A self-dogfooded product, single user | i18n, per-user voice config |

---

## Roadmap

- [ ] Telegram bot as a notification channel (reuse python-telegram-bot from a previous project)
- [ ] ActivityWatch integration for automatic screen-time logging
- [ ] GCal import (calendar blocks as a read-only overlay)
- [ ] Demo account with seed data (a recruiter arrives → not an empty screen)
- [ ] Light theme + responsive desktop layout
- [ ] Voice logging via Whisper

---

## Stats

- ~12 days of development + 2 weeks of self-dogfooded testing (bug-log T1–T19, ~16 fixes/features shipped)
- 8 AI touchpoints (planner, reschedule, insights, review, retro-fill, coach-nudge, weekly digest, weekly reflection advice), 3-model Gemini fallback chain
- `runWithFallback` + `applyPlanBlocks` helpers — 5 files share one chain implementation, 2 actions share one insert implementation
- Anti-burnout focus rules (50min cap + 15min gap) enforced via `validateFocusBlock` across manual edit / drag-resize / planner / reschedule / retro-fill
- Atomic push idempotency (claim-before-send for block start/end + coach + morning nudge)
- TZ-aware everywhere: prompts, timeline, NowLine, week buckets — all honor `profiles.timezone`, not the server clock
- Insights cache busted on every write path (no 2h stale-coaching window after mood/block/profile changes)
- Longitudinal weekly memory: digests + reflections accumulate per week, fed into future coach advice (`getWeekSummariesForRange`)
- Liquid-glass V2 design system (aurora + backdrop-blur chrome + glass-light surfaces), safe-area-aware PWA
- 22 documented blockers (Next.js 16, Supabase custom schema + RLS/grants, PWA auth, TZ math, npm bugs)
- Fully self-dogfooded: built for the author's own ADHD pattern

---

Built by [@mahtalaran](https://github.com/Noritur)
