import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes Supabase auth tokens on every request.
 * Called from proxy.ts (Next.js 16 replacement for middleware.ts).
 *
 * Protected: everything except /sign-in, /auth/*, and Next internals.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run other code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/sign-in") || pathname.startsWith("/auth");
  const isSetPassword = pathname.startsWith("/set-password");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && pathname.startsWith("/sign-in")) {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  // Soft-enforce password setup: nudge authenticated users without a password
  // (and who didn't explicitly skip) toward /set-password.
  if (user && !isAuthRoute && !isSetPassword) {
    const passwordSet = user.user_metadata?.password_set;
    if (!passwordSet) {
      const url = request.nextUrl.clone();
      url.pathname = "/set-password";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
