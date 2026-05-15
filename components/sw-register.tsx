"use client";

import { useEffect } from "react";

/**
 * Mounts a client-side effect that registers the service worker.
 * Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (e) {
        console.warn("sw register failed", e);
      }
    };

    // Defer until idle so SW registration doesn't compete with first paint.
    if ("requestIdleCallback" in window) {
      (window as Window & {
        requestIdleCallback: (cb: () => void) => void;
      }).requestIdleCallback(register);
    } else {
      setTimeout(register, 1500);
    }
  }, []);

  return null;
}
