"use client";

import { useActionState } from "react";
import { Mail, Lock, Sparkles, ArrowRight, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  sendMagicLink,
  verifyEmailCode,
  type SignInState,
} from "./actions";

export default function SignInPage() {
  const [sendState, sendAction, sending] = useActionState<
    SignInState | null,
    FormData
  >(sendMagicLink, null);

  const [verifyState, verifyAction, verifying] = useActionState<
    SignInState | null,
    FormData
  >(verifyEmailCode, null);

  // After code form is shown, verifyState becomes the source of truth.
  const state: SignInState = verifyState ?? sendState ?? { step: "idle" };
  const email = state.email;

  if (state.step === "awaiting_code" && email) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm flex flex-col gap-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-3xl bg-card border border-border flex items-center justify-center">
              <Mail className="w-9 h-9 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold leading-tight">
              лінк і код пішли
            </h1>
            <p className="text-[var(--text-secondary)] text-base leading-snug">
              перевір пошту на цьому пристрої. клікни лінк — або введи
              6-значний код з листа нижче.
            </p>
          </div>

          <div className="rounded-2xl bg-card border border-border p-4 text-sm">
            <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
              надіслано на
            </span>
            <span className="font-semibold text-foreground">{email}</span>
          </div>

          <form action={verifyAction} className="flex flex-col gap-4">
            <input type="hidden" name="email" value={email} />
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="123456"
                required
                disabled={verifying}
                className="h-14 pl-11 rounded-2xl bg-card border-border text-center text-2xl font-bold tracking-[0.4em]"
              />
            </div>
            <Button
              type="submit"
              disabled={verifying}
              className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {verifying ? "..." : "увійти"}
              <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
            {state.error && (
              <p className="text-sm text-destructive text-center">
                {state.error}
              </p>
            )}
          </form>

          <form action={sendAction}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={sending}
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {sending ? "..." : "не прийшло — надіслати ще раз"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-card border border-border flex items-center justify-center">
            <Sparkles className="w-9 h-9 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold leading-tight">adhd tracker</h1>
          <p className="text-[var(--text-secondary)] text-base leading-snug">
            трекер фокусу без зайвого шуму
          </p>
        </div>

        <form action={sendAction} className="flex flex-col gap-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="ваш email"
              defaultValue={email ?? ""}
              required
              disabled={sending}
              className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={sending}
            className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {sending ? "..." : "надіслати magic link"}
            <ArrowRight className="ml-1 w-4 h-4" />
          </Button>
          {state.error && (
            <p className="text-sm text-destructive text-center">{state.error}</p>
          )}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>один лінк, один вхід. без квестів перед кавою.</span>
          </div>
        </form>
      </div>
    </main>
  );
}
