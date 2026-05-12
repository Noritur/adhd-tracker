import { createClient } from "@/lib/supabase/server";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Day 1 stub
        </span>
        <h1 className="text-3xl font-extrabold leading-tight">сьогодні</h1>
        <p className="text-[var(--text-secondary)]">
          залогінений як <span className="font-semibold">{user?.email}</span>.
        </p>
        <p className="text-xs text-muted-foreground">
          таймлайн зявиться в Day 2 (drag/click 24h component).
        </p>
        <form action="/auth/sign-out" method="post" className="mt-4">
          <button
            type="submit"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            вийти
          </button>
        </form>
      </div>
    </main>
  );
}
