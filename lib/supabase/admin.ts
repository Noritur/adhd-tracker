import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS. Use ONLY in server-only
 * contexts where there is no user session (cron handlers, admin scripts).
 * Never expose the resulting client to user-controlled code paths.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "adhd_tracker" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
