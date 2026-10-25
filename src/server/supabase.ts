import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type DB = SupabaseClient<Database>;

/**
 * Supabase client acting as the signed-in user. Every query is subject to RLS.
 * This is the default for all reads and writes.
 */
export const supabaseServer = cache(async (): Promise<DB> => {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
});

/**
 * Service-role client. Bypasses RLS, so it is only used by system processes
 * (email outbox, scheduled jobs, invitation acceptance, webhooks) after their
 * own checks. Never import it into code that handles user input without an
 * explicit permission check first.
 */
export function supabaseService(): DB {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
