"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInStep = "idle" | "awaiting_code";

export type SignInState = {
  step: SignInStep;
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
    return { step: "idle", email, error: "вкажи робочий email" };
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
    const friendlyError =
      error.message.toLowerCase().includes("rate limit")
        ? "перевантажений email. зачекай ~30 хв або введи код з попереднього листа"
        : error.message;
    return { step: "idle", email, error: friendlyError };
  }

  return { step: "awaiting_code", email };
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
    return { step: "idle", error: "email загубився, почни знову" };
  }
  if (!/^\d{6}$/.test(token)) {
    return { step: "awaiting_code", email, error: "код має бути 6 цифр" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { step: "awaiting_code", email, error: error.message };
  }

  redirect("/today");
}

export async function resetSignIn(): Promise<SignInState> {
  return { step: "idle" };
}
