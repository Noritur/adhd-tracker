# ADHD Tracker — Design Brief (mobile, dark, V1)

> **Reference mix:** Duolingo (rounded, bold, friendly) + Things 3 / Sunsama (dark cozy, restrained palette).
> **Vibe:** teal-cool dark з 2 теплими акцентами. NOT a rainbow.
> **Anti-ref:** Toggl, RescueTime, corporate dashboards.

## Concept

Mobile-first dark-only web app. User логує блоки часу drag/click на 24h timeline, AI-coach генерує evening review + inline insights. Vibe — теплий тренер, не corporate tracker. Gamification undertones (streak counter, consistency meter) — без overdoing.

## Constraints

- **Viewport:** iPhone 13/14 mini-pro 375-430×844 base. Desktop рендериться як 430px column центровано на бекграунд.
- **Theme:** dark only. Toggle light = out-of-scope V1.
- **Touch:** все 44×44pt мінімум. 1-hand reachable (primary actions в нижній 2/3 екрану).
- **Stack:** Next.js 16 + Tailwind + shadcn/ui (heavily themed).

## Tone of voice (UI copy)

- Український first, EN fallback.
- Direct, теплий, без буллшіту: "ти подивився netflix 4 год — bool's, давай завтра краще" а не "Ви проявили ознаки відволікання".
- Coach має personality, не "AI Insights": "Coach каже...", "Тренер думає..."
- Empty states з саркастичним gentleness.

## Color palette (teal-leaning, restrained)

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0B1014` | App background (deep cool near-black, slight teal tint) |
| `bg-elevated` | `#131A20` | Card surfaces |
| `bg-card` | `#1A222B` | Higher cards / modals |
| `border-subtle` | `#232D38` | Hairlines |
| `text-primary` | `#ECF2F5` | Headings, primary copy |
| `text-secondary` | `#B0BDC4` | Body |
| `text-muted` | `#7A8892` | Meta, helpers |
| `primary` | `#5EEAD4` | Brand teal (Tailwind teal-300). CTAs, streaks, accents. |
| `primary-pressed` | `#2DD4BF` | Pressed (teal-400) |
| `primary-soft` | `#14B8A6` | Filled buttons / heavy fills (teal-500) |
| `accent-warm` | `#FBBF24` | Streaks, evening review highlights (amber-400) |
| `success` | `#5EEAD4` | Same as primary |
| `warning` | `#FBBF24` | Gentle nudges |
| `danger` | `#F87171` | Destructive (red-400) |

### Category colors (5 hues + 3 neutrals — НЕ радуга)

| Category | Hex | Family | Icon | UI label (UA) |
|---|---|---|---|---|
| `coded` | `#5EEAD4` | teal-300 (primary) | `</>` | код |
| `work_other` | `#2DD4BF` | teal-400 (deeper) | briefcase | робота |
| `sport` | `#6EE7B7` | emerald-300 (teal cousin) | dumbbell | спорт |
| `outdoors` | `#FBBF24` | amber-400 (warm contrast = "вийди з хати") | sun | надвір |
| `social` | `#FDA4AF` | rose-300 (warm contrast = людина, дзвінки, body-double) | speech-bubble | люди |
| `rest` | `#94A3B8` | slate-400 (cool neutral) | moon | відпочинок |
| `chores` | `#64748B` | slate-500 (mid neutral) | broom | побут |
| `other` | `#475569` | slate-600 (deep neutral) | dots | інше |

**Important:** body-double / дзвінки / meetings — це все `social`. НЕ окрема purple/violet категорія. Палітра 8 категорій локнута.

**Логіка палітри:**
- **Productive bucket** → teal/mint family (3 hues: coded / work_other / sport). Виглядають як один родовий клас, але різнотон у heatmap.
- **Warm contrast** (2 hues): amber для outdoors (вийди з хати → сонце), rose для social (людина).
- **Neutrals** (3 slate shades) — rest/chores/other не змагаються за увагу.

Кольори вживаються: timeline block fill (opacity 0.85 на dark bg), pill chips, heatmap cells (mix → dominant), summary tile left-border + numeric accent.

## Typography

- **Font family:** Inter (variable). Fallback: `system-ui, -apple-system, "SF Pro Rounded"`.
- **Weights:** 500 (body), 600 (subhead), 700 (display).

| Role | Size/Line | Weight |
|---|---|---|
| Display | 32/38 | 700 |
| H1 | 26/32 | 700 |
| H2 | 20/26 | 700 |
| Body | 16/22 | 500 |
| Small | 13/18 | 500 |
| Caption | 11/14 | 600, letter-spacing 0.04em, uppercase |

Generous letter-spacing на H-rows. Numerals tabular для timeline labels.

## Shape / spacing

- **Corner radius:** card 20px, button 16px, pill 9999, timeline block 12px, modal 28px top.
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48.
- **Shadows:** mostly flat. Cards = 1px inset top highlight `rgba(255,255,255,0.04)` + бомба subtle drop `0 1px 0 rgba(0,0,0,0.5)`. FAB = stronger drop.

## Iconography

- **Style:** Lucide (rounded, consistent stroke 2px). Дозволені outlined emoji-style spots (😴 ☀️) у coach speech bubbles для тепла.
- **No 3D illustrations.** Flat / bold / line.
- **No mascot V1.** Personality передаємо через copy + colors + animation. Якщо буде traction → потім додаси character.

## Animation primitives

- 200ms ease-out default.
- Spring scale на FAB press (`scale 1 → 0.92 → 1`).
- Slide-up + fade на modal entry (250ms).
- Coach card на page load: 400ms delay, opacity 0→1 + translate-y 8→0.
- Block created: pop-in scale 0.9→1 + green pulse outline 1 cycle.

## Screens (V1 — 7 шт)

### 1. Sign-in (`/sign-in`)
- Full-screen vertical.
- Top 40%: large display heading "Привіт" + 1 рядок підпис "тренер, що тебе не задовбує. трекер, який не корпорейт".
- Middle: email input (large rounded), primary button "Надіслати лінк" (`primary` color, повна ширина, h=56).
- Below button: caption "без паролів — клік і ти всередині".
- Bottom: тонкий link "як це працює?" (відкриває modal з 3-step description).

### 2. Magic link sent (`/sign-in` after submit)
- Replace form: великий зелений checkmark icon + heading "Лінк пішов".
- Email муфт "перевір [email]". Button "відкрити пошту" (mailto link).
- Helper: "немає листа? глянь spam, або надішли ще раз".

### 3. Today (`/today`)
- **Sticky top:**
  - Date pill "сьогодні, 12 травня" (caption muted).
  - Streak chip ("🔥 4 дні", якщо є).
- **Coach card** (зверху, під top bar):
  - bg-elevated, radius 20px, padding 20.
  - Тригер: "Тренер каже..."
  - Body: 2 рядки insight ("3 год кодинг, 0 надворі — час прогулятись 30 хв").
  - Right-aligned small button "ще" → open insights drawer.
- **Timeline** (Center, scrollable):
  - 24h vertical, 1 хв = 1px (24 × 60 = 1440px tall). Auto-scroll до поточної години on mount.
  - Hour labels ліворуч (60px gutter), tabular caption text.
  - Поточний час: thin red line з circle dot.
  - Blocks: rounded 12px, fill category color @ 0.85, label всередині 13/18 weight 600.
  - Empty state inline: "тут буде твій день. свайпни вниз і додай перший блок".
- **FAB** (bottom-right, above bottom nav): `+` icon, 56×56, `primary` bg, drop shadow. Tap = опен Block-edit modal в режимі "new".
- **Bottom nav** (consistent across ALL screens):
  - 3 tabs з lowercase labels: `сьогодні` / `тиждень` / `налашт.` (caption 11/14 600, НЕ uppercase — uppercase виглядає corporate-EN).
  - Big icons (28px) above label.
  - Active state: icon + label color = `primary` teal, мала indicator dot під label або pill bg.
  - Inactive state: icon `text-muted`, label `text-muted`.

### 4. Block edit modal (bottom sheet)
- Slides from bottom, 80vh max, dragable handle.
- Top: title "Новий блок" / "Редагувати".
- Section 1 — Category palette: grid 4×2 з color chips (44px round з іконкою). Selected = ring 2px primary.
- Section 2 — Time: 2 great input rows "Початок" / "Кінець" з native time picker або wheel-style. Show duration label "1 год 30 хв" з right.
- Section 3 — Label: text input, optional, placeholder "що робив? напр. 'auth flow', 'walk dog'".
- Bottom action bar (sticky): "Зберегти" (primary, full-width 70%) + "Видалити" (danger ghost, 30%) — Delete тільки в edit mode.

### 5. Week (`/week`)
- **Sticky top:** week navigator "← Тиждень / 6-12 травня →" з swipe.
- **Summary tiles 2×2 grid** (mobile-optimized; horizontal scroll проявив cramping):
  - 4 tiles bg-elevated, кожен повна ширина column в grid.
  - Title (caption uppercase muted) + big number "18г 40хв" + sub-label "фокус".
  - Color accent: small icon або subtle left-border у category color.
  - Default 4 metrics: focus (coded+work_other), days outdoors, social meets, rest. Configurable у settings (post-MVP).
- **Heatmap "Ритм тижня":**
  - 7 cols (дні ПН-НД) × ~6 rows (time buckets по 4 години: 0-4 / 4-8 / 8-12 / 12-16 / 16-20 / 20-24). 7×24 — too dense для mobile.
  - Cells 32×24px з 4px gap. Mixed category = dominant color, opacity = intensity (0.3-1.0).
  - Tap cell → bottom sheet з list блоків в тому буцеті.
- **Weekly coach card:** "Цього тижня фокус тримається краще, коли спорт стоїть до обіду. Залиши цю опору."

### 6. Evening review modal (full-screen sheet)
- Trigger: page load після 21:00 + є unreviewed entry в `reviews`.
- Top: drag handle + close X (top-right small).
- Eyebrow caption uppercase: "ВЕЧІРНІЙ ЧЕК-ІН"
- h1: "Вечір. Поговоримо?"
- Body section 1 — eyebrow "ЩО БАЧУ" + 2-4 рядки AI summary.
- Body section 2 — eyebrow "РЕКОМЕНДАЦІЯ" в `accent-warm` (amber) + 1-2 рядки recommendation.
- **Buttons — vertical stack** (one-handed friendly):
  - "ОК" (primary teal, full-width, top)
  - "пропустити" (ghost outline)
  - "не сьогодні" (ghost text, smallest, bottom) — disables prompt for 24h.

### 7. Settings (`/settings`)
- List style. Sections з headers.
- Section "Я":
  - Email (read-only row)
  - Тайм-зона (auto-detected, read-only).
- Section "Робота":
  - Час старту / кінця (time inputs).
- Section "Тренер":
  - Tone toggle (Gentle / Firm) — segmented control.
  - Час вечірнього review (time input, default 21:00).
  - Toggle enable/disable review.
- Section "Акаунт":
  - Sign out (ghost danger button).
- Footer: app version + GitHub link.

## Interaction patterns (mobile-specific)

- **Timeline create:** long-press на empty slot (400ms) → ghost preview block → drag вниз = extend → release → opens Block edit modal pre-filled.
- **Timeline edit:** tap block → opens edit modal. Drag edges (top/bottom) на 8px-tall handle = resize. Drag center = move.
- **Pull-to-refresh:** disable (SSR fresh data already).
- **Haptic:** light tap on block create, success buzz on save, error buzz on overlap.
- **Empty state CTAs:** велика стрілка з тексту до FAB.

## Empty states copy

- **Today empty:** "поки порожньо. свайпни вниз або тиснь + щоб додати перший блок. навіть 'дивився ютуб 2 год' рахується — це фідбек для тренера."
- **Week empty:** "ще нема тижня. логи хоч 1 день — побачиш карту."
- **No coach insight:** "тренер ще збирає дані. дай йому 3-4 блоки і він заговорить."

## What's NOT in this brief (out of scope V1)

- Light theme.
- Desktop-specific layout (tablet OK as mobile-stretched).
- Mascot character.
- 3D illustrations.
- Onboarding tutorial.
- Social/sharing features.
- Sound effects.

---

## Mock review notes (2026-05-12)

V1 Pencil mock `pencil-new.pen` зробила Nikola. 7 screens готові + 1 порожній frame (`bi8Au`) — видалити. Drift від v1 brief виявлений і поправлений у файлі вище:

- Bottom nav → lowercase short (`сьогодні / тиждень / налашт.`)
- Week heatmap → 7 days × 6 time-buckets (не 7×24)
- Evening review buttons → vertical stack (не horizontal row)
- Today date pill copy → `сьогодні, 12 травня` (без day-of-week prefix)

Nice additions з mock що тримаємо в продукті:
- App tagline / eyebrow: `тихий режим для дня`
- Body-double як social terminology в copy/onboarding
- "Ритм тижня" як назва heatmap section
- "Нагадування без тиску" toggle в Settings (на toggle level)

---

## Deferred design polish (post-MVP, чіпаємо коли буде час)

1. **Edit sheet category pills — bg + stroke clean-up.** Pill dots уже на palette (fixed 2026-05-12), але card backgrounds і strokes лишилися від попередніх random hues (наприклад "люди" card має brown-rose bg). План: всі 8 pills → bg `#131A20` (bg-elevated), stroke = category accent на opacity ~0.3. Селектований pill: solid ring 2px в accent color на 100%.
2. **"інше" pill dot contrast.** Зараз slate-600 `#475569` на dark card — низький контраст. Якщо в живій імплементації буде візуальна проблема — підняти dot до slate-500 `#64748B` (text color лишити slate-600 для маркерної глибини).
3. **Settings copy lowercase consistency.** На `/settings` зараз Capital First Letter в усіх рядках (`Ім'я та часовий пояс`, `Нагадування без тиску`, `Фокус-вікна`, `Тон порад`, `Вечірній огляд`, `Пошта`, `Вийти`). Решта app — lowercase-friendly. Опустити до lowercase на 8-10 текстах для консистенції. Або навпаки — підняти весь app до Capital, що менш probable.

Усі 3 — cosmetic. Не блокують Day 1 кодинг.
