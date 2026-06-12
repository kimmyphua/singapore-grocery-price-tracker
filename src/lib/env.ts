import { z } from "zod";

const publicSupabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1)
});

const appOriginSchema = z
  .string()
  .url()
  .transform((value, context) => {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "APP_ORIGIN must be an HTTP(S) origin without a path, query, or fragment."
      });
      return z.NEVER;
    }
    return url.origin;
  });

const authServerEnvSchema = publicSupabaseEnvSchema.extend({
  APP_ORIGIN: appOriginSchema
});

const serverEnvSchema = authServerEnvSchema.extend({
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
    appOrigin: value.APP_ORIGIN,
    legacyOwnerEmail: value.LEGACY_OWNER_EMAIL.toLowerCase()
  };
}

export function parseAuthServerEnv(
  input: Record<string, string | undefined>
) {
  const value = authServerEnvSchema.parse(input);
  return {
    supabaseUrl: value.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    appOrigin: value.APP_ORIGIN
  };
}
