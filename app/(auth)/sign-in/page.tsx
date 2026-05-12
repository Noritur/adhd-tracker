"use client";

import { useActionState } from "react";
import { Mail, Lock, Sparkles, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sendMagicLink, type SignInState } from "./actions";

export default function SignInPage() {
  const [state, formAction, pending] = useActionState<SignInState | null, FormData>(
    sendMagicLink,
    null,
  );

  if (state?.ok) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm flex flex-col gap-6 text-center">
          <div className="self-center w-20 h-20 rounded-3xl bg-card border border-border flex items-center justify-center">
            <Mail className="w-9 h-9 text-primary" />
          </div>
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-extrabold leading-tight">
              посилання вже летить
            </h1>
            <p className="text-[var(--text-secondary)] text-base leading-snug">
              перевір пошту на цьому телефоні. якщо листа нема — глянь спам, він
              іноді грає в hide and seek.
            </p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-4 text-sm text-[var(--text-secondary)]">
            <span className="block text-xs text-muted-foreground uppercase tracking-wider mb-1">
              надіслано на
            </span>
            <span className="font-semibold text-foreground">{state.email}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            якщо лист не прийшов — повернись назад.
          </p>
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

        <form action={formAction} className="flex flex-col gap-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="ваш email"
              defaultValue={state?.email ?? ""}
              required
              disabled={pending}
              className="h-14 pl-11 rounded-2xl bg-card border-border text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="h-14 rounded-2xl text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {pending ? "..." : "надіслати magic link"}
            <ArrowRight className="ml-1 w-4 h-4" />
          </Button>
          {state?.error && (
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
