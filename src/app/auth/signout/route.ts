import { handleSignOut } from "@/lib/auth/signout";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { parseAuthServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const supabase = await createSupabaseServerClient();
  const env = parseAuthServerEnv(process.env);

  return handleSignOut(request, {
    appOrigin: env.appOrigin,
    auth: supabase.auth
  });
}
