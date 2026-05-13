"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInStep = "idle" | "awaiting_code";
export type SignInMode = "magic" | "password";

export type SignInState = {
  step: SignInStep;
  mode?: SignInMode;
  email?: string;
  error?: string;
};

export async function sendMagicLink(
  _prev: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { step: "idle", mode: "magic", email, error: "вкажи робочий email" };
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const host = hdrs.get("host") ?? hdrs.get("x-forwarded-host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host?.startsWith("http") ? host : `${proto}://${host}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    const isRateLimit = error.message.toLowerCase().includes("rate limit");
    return {
      step: isRateLimit ? "awaiting_code" : "idle",
      mode: "magic",
      email,
      error: isRateLimit
        ? "перевантажений email. введи 6-значний код з попереднього листа, або зачекай ~30 хв"
        : error.message,
    };
  }

  return { step: "awaiting_code", mode: "magic", email };
}

export async function verifyEmailCode(
  _prev: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s+/g, "");

  if (!email) {
    return { step: "idle", mode: "magic", error: "email загубився, почни знову" };
  }
  if (!/^\d{6}$/.test(token)) {
    return {
      step: "awaiting_code",
      mode: "magic",
      email,
      error: "код має бути 6 цифр",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { step: "awaiting_code", mode: "magic", email, error: error.message };
  }

  redirect("/today");
}

export async function signInWithPassword(
  _prev: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      step: "idle",
      mode: "password",
      email,
      error: "введи email і пароль",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message to avoid leaking which side was wrong.
    return {
      step: "idle",
      mode: "password",
      email,
      error: "невірний email або пароль",
    };
  }

  redirect("/today");
}
