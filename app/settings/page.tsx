import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/bottom-nav";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border/40">
        <div className="px-4 py-3">
          <h1 className="text-3xl font-extrabold leading-tight">налаштування</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            те що справді впливає на день.
          </p>
        </div>
      </header>

      <div className="px-4 py-5 pb-32 flex flex-col gap-4">
        <Section title="Я">
          <Row label="email" value={user.email ?? ""} />
        </Section>

        <Section title="Акаунт">
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="w-full flex items-center justify-between bg-card border border-border rounded-2xl p-4 text-base font-semibold text-destructive"
            >
              <span>вийти</span>
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </Section>

        <p className="text-xs text-muted-foreground text-center mt-4">
          більше налаштувань — у наступних днях (Day 6).
        </p>
      </div>

      <BottomNav />
    </main>
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
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-2xl p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
