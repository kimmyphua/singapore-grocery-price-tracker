import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const adminEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_FLYER_BUCKET: z.string().trim().min(1).default("flyers")
});

export function getSupabaseAdminConfig() {
  const env = adminEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_FLYER_BUCKET: process.env.SUPABASE_FLYER_BUCKET
  });
  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
    flyerBucket: env.SUPABASE_FLYER_BUCKET
  };
}

export function createSupabaseAdminClient() {
  const env = getSupabaseAdminConfig();
  return createClient(env.supabaseUrl, env.secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
