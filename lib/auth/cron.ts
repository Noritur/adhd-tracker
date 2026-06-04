/**
 * Cron request authentication.
 *
 * All `/api/{block-tick,morning-nudge,review}` routes share a Bearer
 * `${CRON_SECRET}` check. The previous inline implementation built the
 * comparison string with `\`Bearer ${process.env.CRON_SECRET}\`` — if
 * the env var was missing or empty, the accepted credential silently
 * became the predictable string "Bearer undefined" / "Bearer ",
 * letting an attacker invoke service-role routes, trigger AI cost,
 * write reviews, and send push spam on a misconfigured deployment.
 *
 * `requireCronAuth` fails closed on missing/empty CRON_SECRET so the
 * routes refuse to authenticate at all in that state. One shared helper
 * keeps the three routes from drifting apart.
 */
export function requireCronAuth(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "cron.auth.missing_secret",
      }),
    );
    return new Response("server misconfigured", { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}
