"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = {
  error?: string;
};

export async function setPassword(
  _prev: SetPasswordState | null,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "мін. 8 символів" };
  }
  if (password !== confirm) {
    return { error: "паролі не співпадають" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
    data: { password_set: true },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/today");
}

export async function skipPassword() {
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { password_set: "skipped" },
  });
  redirect("/today");
}
