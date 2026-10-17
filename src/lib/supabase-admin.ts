import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client (uses service role key — never expose to client)
// A fresh client alone does not bypass Next's persistent fetch cache.
export function getSupabaseAdmin(options: { fresh?: boolean } = {}): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceRoleKey, {
    ...(options.fresh ? {
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    } : {}),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
