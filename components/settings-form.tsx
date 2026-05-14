"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  updateProfileAction,
  type UpdateProfileState,
} from "@/app/settings/actions";
import type { AiTone, Profile } from "@/lib/db/profile";

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
        <Row label="вечірнє ревью">
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
        <Row label="час ревью">
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
