import { z } from "zod";
import {
  createLoginIntent,
  invalidateLoginIntent,
  LoginRateLimitError,
  type LoginIntentStore
} from "@/lib/auth/login-intents";
import { parseAuthServerEnv } from "@/lib/env";

export type LoginActionState =
  | { status: "idle" }
  | { status: "sent"; message: string }
  | {
      status: "error";
      code:
        | "INVALID_INPUT"
        | "RATE_LIMITED"
        | "AUTH_UNAVAILABLE";
      message: string;
    };

type LoginAuthAdapter = {
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string };
  }): Promise<{ data: unknown; error: unknown }>;
};

export type LoginRequestDependencies = {
  appOrigin: string;
  requesterKey: string;
  intents: LoginIntentStore;
  auth: LoginAuthAdapter;
  now?: Date;
};

type HeaderReader = {
  get(name: string): string | null;
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

  let nonce: string | undefined;

  try {
    const duration = payload.data.stayLoggedIn
      ? "THIRTY_DAYS"
      : "ONE_DAY";
    const created = await createLoginIntent(
      dependencies.intents,
      duration,
      {
        email: payload.data.email,
        requesterKey: dependencies.requesterKey
      },
      dependencies.now
    );
    nonce = created.nonce;
    const callbackUrl = new URL(
      "/auth/callback",
      dependencies.appOrigin
    );
    callbackUrl.searchParams.set("intent", nonce);
    const result = await dependencies.auth.signInWithOtp({
      email: payload.data.email,
      options: {
        emailRedirectTo: callbackUrl.toString()
      }
    });

    if (result.error) {
      await invalidateLoginIntent(
        dependencies.intents,
        nonce,
        dependencies.now
      ).catch(() => undefined);
      const providerError = providerErrorSchema.safeParse(result.error);

      if (providerError.success && providerError.data.status === 429) {
        return rateLimitedState();
      }

      return authUnavailableState();
    }

    return {
      status: "sent",
      message: "Check your email for a sign-in link."
    };
  } catch (error) {
    if (nonce) {
      await invalidateLoginIntent(
        dependencies.intents,
        nonce,
        dependencies.now
      ).catch(() => undefined);
    }
    if (error instanceof LoginRateLimitError) {
      return rateLimitedState();
    }
    return authUnavailableState();
  }
}

export function getLoginRequestContext(
  headerStore: HeaderReader,
  env: Record<string, string | undefined>
) {
  const config = parseAuthServerEnv(env);
  const forwardedFor = headerStore.get("x-forwarded-for");
  const requesterKey =
    forwardedFor?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip")?.trim() ||
    "unknown";

  return {
    appOrigin: config.appOrigin,
    requesterKey
  };
}

export function authUnavailableState(): LoginActionState {
  return {
    status: "error",
    code: "AUTH_UNAVAILABLE",
    message: "Sign-in is temporarily unavailable. Try again later."
  };
}

function rateLimitedState(): LoginActionState {
  return {
    status: "error",
    code: "RATE_LIMITED",
    message: "Too many sign-in attempts. Try again later."
  };
}
