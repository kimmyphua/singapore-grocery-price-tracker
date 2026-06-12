import { z } from "zod";

const publicSupabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1)
});

const serverEnvSchema = publicSupabaseEnvSchema.extend({
  LEGACY_OWNER_EMAIL: z.string().email()
});

export function parsePublicSupabaseEnv(
  input: Record<string, string | undefined>
) {
  const value = publicSupabaseEnvSchema.parse(input);
  return {
    supabaseUrl: value.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  };
}

export function parseServerEnv(input: Record<string, string | undefined>) {
  const value = serverEnvSchema.parse(input);
  return {
    supabaseUrl: value.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    legacyOwnerEmail: value.LEGACY_OWNER_EMAIL.toLowerCase()
  };
}
