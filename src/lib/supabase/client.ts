import { createBrowserClient } from "@supabase/ssr";
import { parsePublicSupabaseEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = parsePublicSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });

  return createBrowserClient(
    env.supabaseUrl,
    env.supabasePublishableKey
  );
}
