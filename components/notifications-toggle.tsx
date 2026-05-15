"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/settings/push-actions";

type Status =
  | "loading"
  | "unsupported"
  | "denied"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationsToggle({
  vapidPublicKey,
}: {
  vapidPublicKey: string;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [pending, startTransition] = useTransition();

  const refresh = async () => {
    if (typeof window === "undefined") {
      setStatus("unsupported");
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setStatus("off");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("off");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const enable = async () => {
    if (!vapidPublicKey) {
      toast.error("vapid ключ не налаштовано");
      return;
    }
    try {
      // Service worker мав уже зареєструватись в layout, але підстрахуємось.
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        toast.error("ти не дозволив сповіщення");
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: pushManager types lag behind, ArrayBufferLike vs ArrayBuffer.
          applicationServerKey: urlBase64ToUint8Array(
            vapidPublicKey,
          ) as unknown as BufferSource,
        }));

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error("підписка повернула неповні ключі");
        return;
      }

      startTransition(async () => {
        const res = await subscribePushAction({
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
          user_agent: navigator.userAgent.slice(0, 200),
        });
        if (res.ok) {
          setStatus("on");
          toast.success("сповіщення увімкнено");
        } else {
          toast.error(res.error ?? "не вдалось зберегти підписку");
        }
      });
    } catch (e) {
      console.error("enable push failed", e);
      toast.error(e instanceof Error ? e.message : "помилка");
    }
  };

  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint ?? "";

      if (sub) await sub.unsubscribe();

      if (endpoint) {
        startTransition(async () => {
          const res = await unsubscribePushAction(endpoint);
          if (res.ok) {
            setStatus("off");
            toast.success("сповіщення вимкнено");
          } else {
            toast.error(res.error ?? "помилка");
          }
        });
      } else {
        setStatus("off");
      }
    } catch (e) {
      console.error("disable push failed", e);
      toast.error(e instanceof Error ? e.message : "помилка");
    }
  };

  if (status === "loading") {
    return <Row label="сповіщення">…</Row>;
  }
  if (status === "unsupported") {
    return (
      <Row label="сповіщення">
        <span className="text-xs text-muted-foreground">
          не підтримується цим браузером
        </span>
      </Row>
    );
  }
  if (status === "denied") {
    return (
      <Row label="сповіщення">
        <span className="text-xs text-muted-foreground">
          заблоковано — відкрий налаштування браузера
        </span>
      </Row>
    );
  }

  const on = status === "on";
  return (
    <Row label="сповіщення">
      <button
        type="button"
        onClick={on ? disable : enable}
        disabled={pending}
        aria-pressed={on}
        className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
          on ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow-sm transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </Row>
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
