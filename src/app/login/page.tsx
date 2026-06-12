import { headers } from "next/headers";
import {
  authUnavailableState,
  getLoginRequestContext,
  sendMagicLink,
  type LoginActionState
} from "@/lib/auth/login";
import {
  prismaLoginIntentStore
} from "@/lib/auth/login-intents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

async function sendMagicLinkAction(
  _state: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  "use server";

  const headerStore = headers();
  const context = getLoginRequestContext(headerStore, process.env);

  const supabase = await createSupabaseServerClient();

  return sendMagicLink(
    {
      email: formData.get("email"),
      stayLoggedIn: formData.get("stayLoggedIn") === "on"
    },
    {
      ...context,
      intents: prismaLoginIntentStore,
      auth: supabase.auth
    }
  );
}

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const initialState = loginErrorState(searchParams?.error);

  return (
    <div className="mx-auto max-w-md">
      <section className="rounded-lg border border-teal/15 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-teal">Private price tracker</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">
          Sign in with email
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          We will email you a one-time link. The link expires after 15 minutes.
        </p>
        <LoginForm action={sendMagicLinkAction} initialState={initialState} />
      </section>
    </div>
  );
}

function loginErrorState(error: string | undefined): LoginActionState {
  if (error === "invalid_link") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "This sign-in link is invalid or has expired."
    };
  }

  if (error === "rate_limited") {
    return {
      status: "error",
      code: "RATE_LIMITED",
      message: "Too many sign-in attempts. Try again later."
    };
  }

  if (error === "auth_unavailable") {
    return authUnavailableState();
  }

  return { status: "idle" };
}
