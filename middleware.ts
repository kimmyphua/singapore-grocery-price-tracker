import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parsePublicSupabaseEnv } from "@/lib/env";

const PUBLIC_AUTH_PATHS = new Set(["/login"]);

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = parsePublicSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });
  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const userResult = await supabase.auth.getUser().catch(() => ({
    data: { user: null },
    error: new Error("Authentication provider unavailable")
  }));

  if (
    !PUBLIC_AUTH_PATHS.has(request.nextUrl.pathname) &&
    !request.nextUrl.pathname.startsWith("/api/") &&
    !userResult.error &&
    !userResult.data.user
  ) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    destination.search = "";
    const redirect = NextResponse.redirect(destination);

    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });

    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
