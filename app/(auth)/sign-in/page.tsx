"use client";

import { useActionState, useState } from "react";
import {
  Mail,
  Lock,
  Sparkles,
  ArrowRight,
  KeyRound,
  LockKeyhole,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  sendMagicLink,
  signInWithPassword,
  verifyEmailCode,
  type SignInState,
  type SignInMode,
} from "./actions";

export default function SignInPage() {
  const [mode, setMode] = useState<SignInMode>("magic");

  const [magicState, magicAction, magicPending] = useActionState<
    SignInState | null,
    FormData
  >(sendMagicLink, null);

  const [codeState, codeAction, codePending] = useActionState<
    SignInState | null,
    FormData
  >(verifyEmailCode, null);

  const [passwordState, passwordAction, passwordPending] = useActionState<
    SignInState | null,
    FormData
  >(signInWithPassword, null);

  const state: SignInState =
    codeState ?? magicState ?? passwordState ?? { step: "idle", mode };
  const email = state.email;

  // Awaiting OTP code from magic-link email
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
              перевір пошту. клікни лінк — або введи 6-значний код з листа.
            </p>
          </div>

          <div className="rounded-2xl bg-card border border-border p-4 text-sm">
            <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
              надіслано на
            </span>
            <span className="font-semibold text-foreground">{email}</span>
          </div>

          <form action={codeAction} className="flex flex-col gap-4">
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
                disabled={codePending}
                className="h-14 pl-11 rounded-2xl bg-card border-border text-center text-2xl font-bold tracking-[0.4em]"
              />
            </div>
            <Button
              type="submit"
              disabled={codePending}
              className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {codePending ? "..." : "увійти"}
              <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
            {state.error && (
              <p className="text-sm text-destructive text-center">
                {state.error}
              </p>
            )}
          </form>

          <form action={magicAction}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={magicPending}
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {magicPending ? "..." : "не прийшло — надіслати ще раз"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Default: hero + mode tabs + form
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

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-2xl bg-card border border-border">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors ${
              mode === "password"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            пароль
          </button>
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`flex-1 h-10 rounded-xl text-sm font-bold transition-colors ${
              mode === "magic"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            magic link
          </button>
        </div>

        {mode === "password" ? (
          <form action={passwordAction} className="flex flex-col gap-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="email"
                defaultValue={email ?? ""}
                required
                disabled={passwordPending}
                className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
              />
            </div>
            <div className="relative">
              <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="пароль"
                required
                disabled={passwordPending}
                className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
              />
            </div>
            <Button
              type="submit"
              disabled={passwordPending}
              className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {passwordPending ? "..." : "увійти"}
              <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
            {state.error && (
              <p className="text-sm text-destructive text-center">
                {state.error}
              </p>
            )}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              <span>ще нема паролю? спочатку через magic link.</span>
            </div>
          </form>
        ) : (
          <form action={magicAction} className="flex flex-col gap-4">
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
                disabled={magicPending}
                className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
              />
            </div>
            <Button
              type="submit"
              disabled={magicPending}
              className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {magicPending ? "..." : "надіслати magic link"}
              <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
            {state.error && (
              <p className="text-sm text-destructive text-center">
                {state.error}
              </p>
            )}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              <span>один лінк, один вхід. без квестів перед кавою.</span>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
