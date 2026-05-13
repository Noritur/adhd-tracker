"use client";

import { useActionState } from "react";
import {
  ShieldCheck,
  Lock,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  setPassword,
  skipPassword,
  type SetPasswordState,
} from "./actions";

export default function SetPasswordPage() {
  const [state, formAction, pending] = useActionState<
    SetPasswordState | null,
    FormData
  >(setPassword, null);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-card border border-border flex items-center justify-center">
            <ShieldCheck className="w-9 h-9 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold leading-tight">залишся тут</h1>
          <p className="text-[var(--text-secondary)] text-base leading-snug">
            встанови пароль — щоб більше не ловити magic link
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="password"
                name="password"
                autoComplete="new-password"
                placeholder="новий пароль"
                required
                minLength={8}
                disabled={pending}
                className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
              />
            </div>
            <span className="text-xs text-muted-foreground pl-4">
              мін. 8 символів
            </span>
          </div>

          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="password"
              name="confirm"
              autoComplete="new-password"
              placeholder="ще раз"
              required
              minLength={8}
              disabled={pending}
              className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {pending ? "..." : "зберегти і продовжити"}
            <ArrowRight className="ml-1 w-4 h-4" />
          </Button>

          {state?.error && (
            <p className="text-sm text-destructive text-center">{state.error}</p>
          )}
        </form>

        <div className="rounded-2xl bg-card border-l-[3px] border-l-[var(--accent-warm)] border-y border-r border-border p-4">
          <span className="block text-xs uppercase tracking-wider font-bold mb-1 text-[var(--accent-warm)]">
            тренер
          </span>
          <p className="text-sm text-[var(--text-secondary)] leading-snug">
            magic link ще працює як backup. але з паролем — один тап до
            "сьогодні", без чекання.
          </p>
        </div>

        <form action={skipPassword}>
          <button
            type="submit"
            className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            встановлю пізніше
          </button>
        </form>
      </div>
    </main>
  );
}
