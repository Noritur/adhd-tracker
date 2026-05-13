"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, ChartColumn, SlidersHorizontal } from "lucide-react";

const tabs = [
  { href: "/today", label: "сьогодні", icon: CalendarCheck },
  { href: "/week", label: "тиждень", icon: ChartColumn },
  { href: "/settings", label: "налашт.", icon: SlidersHorizontal },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] bg-background/85 backdrop-blur border-t border-border/40">
      <div className="mx-auto max-w-md px-3 py-2">
        <div className="bg-card border border-border rounded-full p-1 flex gap-1">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-12 rounded-full transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-5 h-5" strokeWidth={2} />
                <span className="text-[10px] font-bold">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
