import { headers } from "next/headers";
import { z } from "zod";
import {
  createLoginIntent,
  prismaLoginIntentStore,
  type LoginIntentStore
} from "@/lib/auth/login-intents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  LoginForm,
  type LoginActionState
} from "./login-form";

export const dynamic = "force-dynamic";

type LoginAuthAdapter = {
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string };
  }): Promise<{ data: unknown; error: unknown }>;
};

export type LoginRequestDependencies = {
  origin: string;
  intents: LoginIntentStore;
  auth: LoginAuthAdapter;
  now?: Date;
};

const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => {
      const at = email.lastIndexOf("@");
      return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`;
    }),
  stayLoggedIn: z.boolean()
});

const providerErrorSchema = z.object({
  status: z.number().optional()
});

export async function sendMagicLink(
  input: unknown,
  dependencies: LoginRequestDependencies
): Promise<LoginActionState> {
  const payload = loginRequestSchema.safeParse(input);

  if (!payload.success) {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "Enter a valid email address."
    };
  }

  try {
    const duration = payload.data.stayLoggedIn
      ? "THIRTY_DAYS"
      : "ONE_DAY";
    const { nonce } = await createLoginIntent(
      dependencies.intents,
      duration,
      dependencies.now
    );
    const callbackUrl = new URL("/auth/callback", dependencies.origin);
    callbackUrl.searchParams.set("intent", nonce);
    const result = await dependencies.auth.signInWithOtp({
      email: payload.data.email,
      options: {
        emailRedirectTo: callbackUrl.toString()
      }
    });

    if (result.error) {
      const providerError = providerErrorSchema.safeParse(result.error);

      if (providerError.success && providerError.data.status === 429) {
        return {
          status: "error",
          code: "RATE_LIMITED",
          message: "Too many sign-in attempts. Try again later."
        };
      }

      return authUnavailableState();
    }

    return {
      status: "sent",
      message: "Check your email for a sign-in link."
    };
  } catch {
    return authUnavailableState();
  }
}

async function sendMagicLinkAction(
  _state: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  "use server";

  const headerStore = headers();
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost ?? headerStore.get("host");
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  if (!host) {
    return authUnavailableState();
  }

  const supabase = await createSupabaseServerClient();

  return sendMagicLink(
    {
      email: formData.get("email"),
      stayLoggedIn: formData.get("stayLoggedIn") === "on"
    },
    {
      origin: `${protocol}://${host}`,
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

function authUnavailableState(): LoginActionState {
  return {
    status: "error",
    code: "AUTH_UNAVAILABLE",
    message: "Sign-in is temporarily unavailable. Try again later."
  };
}
