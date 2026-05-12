"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  ok?: boolean;
  error?: string;
  email?: string;
};

export async function sendMagicLink(
  _prev: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "вкажи робочий email", email };
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const origin = hdrs.get("origin") ?? hdrs.get("x-forwarded-host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const base = origin?.startsWith("http") ? origin : `${proto}://${origin}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${base}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { error: error.message, email };
  }

  return { ok: true, email };
}
