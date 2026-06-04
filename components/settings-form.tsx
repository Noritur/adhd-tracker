"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  updateProfileAction,
  type UpdateProfileState,
} from "@/app/settings/actions";
import {
  DEFAULT_REST_DAYS,
  type AiTone,
  type Profile,
} from "@/lib/db/profile";

const WEEKDAY_CHIPS: { value: number; label: string }[] = [
  { value: 1, label: "пн" },
  { value: 2, label: "вт" },
  { value: 3, label: "ср" },
  { value: 4, label: "чт" },
  { value: 5, label: "пт" },
  { value: 6, label: "сб" },
  { value: 0, label: "нд" },
];

const POPULAR_TIMEZONES = [
  "Europe/Madrid",
  "Europe/Kyiv",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Warsaw",
  "Europe/Amsterdam",
  "Europe/Istanbul",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Jakarta",
  "Australia/Sydney",
  "UTC",
];

function hhmm(timeColon: string | undefined, fallback: string): string {
  if (!timeColon) return fallback;
  return timeColon.slice(0, 5);
}

export function SettingsForm({
  profile,
  email,
}: {
  profile: Profile | null;
  email: string;
}) {
  const [state, formAction, isPending] = useActionState<
    UpdateProfileState | null,
    FormData
  >(updateProfileAction, null);

  const [tone, setTone] = useState<AiTone>(profile?.ai_tone ?? "gentle");
  const [reviewEnabled, setReviewEnabled] = useState<boolean>(
    profile?.evening_review_enabled ?? true,
  );
  const [restDays, setRestDays] = useState<Set<number>>(
    new Set(profile?.rest_days?.length ? profile.rest_days : DEFAULT_REST_DAYS),
  );

  const toggleRestDay = (wd: number) => {
    setRestDays((prev) => {
      const next = new Set(prev);
      if (next.has(wd)) next.delete(wd);
      else next.add(wd);
      return next;
    });
  };

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("збережено");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const tz = profile?.timezone ?? "Europe/Madrid";
  const workStart = hhmm(profile?.work_hours_start, "09:00");
  const workEnd = hhmm(profile?.work_hours_end, "18:00");
  const reviewAt = hhmm(profile?.evening_review_at, "21:00");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Section title="Я">
        <Row label="email">
          <span className="text-sm font-semibold truncate max-w-[60%]">
            {email}
          </span>
        </Row>
        <Row label="часовий пояс">
          <select
            name="timezone"
            defaultValue={tz}
            className="bg-transparent text-sm font-semibold text-right outline-none cursor-pointer max-w-[60%]"
          >
            {POPULAR_TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title="Робота">
        <Row label="починаю">
          <input
            type="time"
            name="work_hours_start"
            defaultValue={workStart}
            className="bg-transparent text-sm font-semibold text-right outline-none tabular-nums"
          />
        </Row>
        <Row label="закінчую">
          <input
            type="time"
            name="work_hours_end"
            defaultValue={workEnd}
            className="bg-transparent text-sm font-semibold text-right outline-none tabular-nums"
          />
        </Row>
        <input
          type="hidden"
          name="rest_days"
          value={Array.from(restDays).sort().join(",")}
        />
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">вихідні</span>
            <span className="text-[11px] text-muted-foreground/60">
              у ці дні AI не тисне на продуктивність
            </span>
          </div>
          <div className="flex gap-1">
            {WEEKDAY_CHIPS.map((wd) => {
              const active = restDays.has(wd.value);
              return (
                <button
                  key={wd.value}
                  type="button"
                  onClick={() => toggleRestDay(wd.value)}
                  className={`flex-1 h-9 rounded-full text-xs font-bold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {wd.label}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="Тренер">
        <Row label="тон">
          <input type="hidden" name="ai_tone" value={tone} />
          <div className="flex bg-muted/60 rounded-full p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setTone("gentle")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                tone === "gentle"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              м&apos;який
            </button>
            <button
              type="button"
              onClick={() => setTone("firm")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                tone === "firm"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              жорсткий
            </button>
          </div>
        </Row>
        <Row label="AI сповіщення">
          <input
            type="hidden"
            name="evening_review_enabled"
            value={reviewEnabled ? "1" : "0"}
          />
          <button
            type="button"
            onClick={() => setReviewEnabled((v) => !v)}
            aria-pressed={reviewEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              reviewEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow-sm transition-transform ${
                reviewEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </Row>
        <p className="text-[11px] text-muted-foreground/70 -mt-1 px-1">
          ранковий план, нагадування про блоки, проактивний коуч і вечірнє ревью. вимкни щоб ніщо не приходило само.
        </p>
        <Row label="час вечірнього ревью">
          <input
            type="time"
            name="evening_review_at"
            defaultValue={reviewAt}
            disabled={!reviewEnabled}
            className="bg-transparent text-sm font-semibold text-right outline-none tabular-nums disabled:opacity-40"
          />
        </Row>
      </Section>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-primary text-primary-foreground rounded-2xl p-4 text-base font-semibold disabled:opacity-50"
      >
        {isPending ? "зберігаю..." : "зберегти"}
      </button>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold pl-1">
        {title}
      </span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-2xl p-4 gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
