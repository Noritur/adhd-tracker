import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/db/profile";
import { BottomNav } from "@/components/bottom-nav";
import { SettingsForm } from "@/components/settings-form";
import { NotificationsToggle } from "@/components/notifications-toggle";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const profile = await getProfile(supabase, user.id);

  return (
    <main className="min-h-screen flex flex-col">
      <div aria-hidden className="aurora-bg fixed inset-0 -z-10 pointer-events-none" />
      <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top)] glass-chrome rounded-b-3xl">
        <div className="px-4 py-3">
          <h1 className="text-3xl font-extrabold leading-tight">налаштування</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            те що справді впливає на день.
          </p>
        </div>
      </header>

      <div className="px-4 py-5 pb-32 flex flex-col gap-6">
        <SettingsForm profile={profile} email={user.email ?? ""} />

        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold pl-1">
            Сповіщення
          </span>
          <NotificationsToggle
            vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
          />
          <p className="text-xs text-muted-foreground pl-1">
            на iOS — спочатку додай на головний екран (share → "На головний
            екран"), потім увімкни тут.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold pl-1">
            Акаунт
          </span>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="w-full flex items-center justify-between glass-light rounded-2xl min-h-[52px] px-4 text-sm font-semibold text-destructive"
            >
              <span>вийти</span>
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
