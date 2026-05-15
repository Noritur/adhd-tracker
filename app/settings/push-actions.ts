"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deleteSubscriptionByEndpoint,
  upsertSubscription,
} from "@/lib/db/push-subscriptions";

export type SubscribeInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
};

export type SubscribeResult = { ok: boolean; error?: string };

export async function subscribePushAction(
  input: SubscribeInput,
): Promise<SubscribeResult> {
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false, error: "невалідна підписка" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  try {
    await upsertSubscription(supabase, {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.user_agent ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save failed";
    console.error(
      JSON.stringify({
        level: "error",
        msg: "push.subscribe_failed",
        error: msg,
      }),
    );
    return { ok: false, error: msg };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function unsubscribePushAction(
  endpoint: string,
): Promise<SubscribeResult> {
  if (!endpoint) return { ok: false, error: "missing endpoint" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  try {
    await deleteSubscriptionByEndpoint(supabase, endpoint, user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "delete failed";
    console.error(
      JSON.stringify({
        level: "error",
        msg: "push.unsubscribe_failed",
        error: msg,
      }),
    );
    return { ok: false, error: msg };
  }

  revalidatePath("/settings");
  return { ok: true };
}
