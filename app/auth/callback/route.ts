import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles Supabase magic-link callbacks for BOTH flows:
 *  - PKCE: ?code=...
 *  - OTP (default email magic-link): ?token_hash=&type=magiclink
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/today";

  console.log(
    JSON.stringify({
      level: "info",
      msg: "auth.callback.start",
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      type,
    }),
  );

  const supabase = await createClient();

  const successDestination = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const passwordSet = user?.user_metadata?.password_set;
    // First-time-after-magic-link users → force /set-password.
    // Users who explicitly skipped have password_set='skipped' (truthy) → no redirect.
    if (passwordSet) {
      return `${origin}${next}`;
    }
    return `${origin}/set-password`;
  };

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.log(JSON.stringify({ level: "info", msg: "auth.callback.pkce_ok" }));
      return NextResponse.redirect(await successDestination());
    }
    console.error(
      JSON.stringify({
        level: "error",
        msg: "auth.callback.pkce_failed",
        error: error.message,
      }),
    );
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      console.log(JSON.stringify({ level: "info", msg: "auth.callback.otp_ok" }));
      return NextResponse.redirect(await successDestination());
    }
    console.error(
      JSON.stringify({
        level: "error",
        msg: "auth.callback.otp_failed",
        error: error.message,
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "auth.callback.no_params",
        url: request.url,
      }),
    );
  }

  return NextResponse.redirect(
    `${origin}/sign-in?error=invalid_link`,
  );
}
