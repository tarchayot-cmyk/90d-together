import { createBrowserClient } from "@supabase/ssr";

// Client-side Supabase instance. Uses the anon key only — every
// sensitive mutation goes through RPC functions (SECURITY DEFINER)
// or route handlers, never direct table writes from the browser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
