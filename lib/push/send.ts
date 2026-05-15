import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteSubscriptionByEndpoint,
  getSubscriptionsForUser,
  type PushSubscriptionRow,
} from "@/lib/db/push-subscriptions";

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "push.vapid_not_configured",
        has_pub: !!pub,
        has_priv: !!priv,
        has_subject: !!subject,
      }),
    );
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Send to one subscription. Returns true on success, false on failure.
 *  410/404 → subscription deleted from DB. */
export async function sendToSubscription(
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<boolean> {
  if (!ensureVapid()) return false;

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 4 },
    );
    return true;
  } catch (e) {
    const status =
      e && typeof e === "object" && "statusCode" in e
        ? (e as { statusCode: number }).statusCode
        : null;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      JSON.stringify({
        level: "error",
        msg: "push.send_failed",
        status,
        endpoint: sub.endpoint.slice(0, 60),
        error: msg,
      }),
    );
    if (status === 404 || status === 410) {
      // Subscription is gone — clean up.
      try {
        const admin = createAdminClient();
        await deleteSubscriptionByEndpoint(admin, sub.endpoint);
      } catch (de) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "push.cleanup_failed",
            error: de instanceof Error ? de.message : String(de),
          }),
        );
      }
    }
    return false;
  }
}

/** Send the same payload to every subscription a user has registered. */
export async function sendToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const subs = await getSubscriptionsForUser(admin, userId);
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.all(
    subs.map((s) => sendToSubscription(s, payload)),
  );
  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
}
