import {
  handleSignOut,
  prismaSignOutDb
} from "@/lib/auth/signout";
import { parseAuthServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const env = parseAuthServerEnv(process.env);

  return handleSignOut(request, {
    appOrigin: env.appOrigin,
    auth: supabase.auth,
    db: prismaSignOutDb
  });
}
