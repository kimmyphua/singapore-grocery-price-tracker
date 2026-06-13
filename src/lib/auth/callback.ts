import { z } from "zod";
import { NextResponse } from "next/server";
import {
  consumeLoginIntent,
  type LoginIntentStore
} from "@/lib/auth/login-intents";
import { prisma } from "@/lib/db";

type CallbackAuthAdapter = {
  exchangeCodeForSession(
    code: string
  ): Promise<{ data: unknown; error: unknown }>;
  verifyOtp(input: {
    token_hash: string;
    type: "email";
  }): Promise<{ data: unknown; error: unknown }>;
  getUser(): Promise<{
    data: { user: unknown };
    error: unknown;
  }>;
  getClaims(): Promise<{
    data: { claims: unknown } | null;
    error: unknown;
  }>;
  signOut(options: { scope: "local" }): Promise<unknown>;
};

type CallbackDb = {
  upsertProfile(input: {
    supabaseUserId: string;
    email: string;
  }): Promise<{ id: string }>;
  createSession(input: {
    profileId: string;
    supabaseSessionId: string;
    expiresAt: Date;
  }): Promise<void>;
};

export type AuthCallbackDependencies = {
  auth: CallbackAuthAdapter;
  intents: LoginIntentStore;
  db: CallbackDb;
  appOrigin: string;
  now?: Date;
};

const callbackPayloadSchema = z.union([
  z.object({
    code: z.string().min(1).max(4096),
    intent: z.string().min(1).max(256)
  }),
  z.object({
    token_hash: z.string().min(1).max(4096),
    type: z.literal("email"),
    intent: z.string().min(1).max(256)
  })
]);

const verifiedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email()
});

const verifiedClaimsSchema = z.object({
  sub: z.string().uuid(),
  session_id: z.string().uuid()
});

export const prismaCallbackDb: CallbackDb = {
  upsertProfile({ supabaseUserId, email }) {
    return prisma.userProfile.upsert({
      where: { supabaseUserId },
      create: { supabaseUserId, email },
      update: { email },
      select: { id: true }
    });
  },
  async createSession(input) {
    await prisma.appSession.create({ data: input });
  }
};

export async function handleAuthCallback(
  request: Request,
  dependencies: AuthCallbackDependencies
) {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");
  const code = url.searchParams.get("code");
  const payload = callbackPayloadSchema.safeParse(
    code
      ? { code, intent }
      : {
          token_hash: url.searchParams.get("token_hash"),
          type: url.searchParams.get("type"),
          intent
        }
  );

  if (!payload.success) {
    return loginRedirect(dependencies.appOrigin, "invalid_link");
  }

  let verificationCompleted = false;

  try {
    const verification =
      "code" in payload.data
        ? await dependencies.auth.exchangeCodeForSession(payload.data.code)
        : await dependencies.auth.verifyOtp({
            token_hash: payload.data.token_hash,
            type: payload.data.type
          });

    if (verification.error) {
      return loginRedirect(dependencies.appOrigin, "invalid_link");
    }

    verificationCompleted = true;
    const [userResult, claimsResult] = await Promise.all([
      dependencies.auth.getUser(),
      dependencies.auth.getClaims()
    ]);

    if (userResult.error || claimsResult.error || !claimsResult.data) {
      return callbackFailure(
        dependencies.auth,
        dependencies.appOrigin,
        "auth_unavailable"
      );
    }

    const user = verifiedUserSchema.safeParse(userResult.data.user);
    const claims = verifiedClaimsSchema.safeParse(claimsResult.data.claims);

    if (
      !user.success ||
      !claims.success ||
      claims.data.sub !== user.data.id
    ) {
      return callbackFailure(
        dependencies.auth,
        dependencies.appOrigin,
        "invalid_link"
      );
    }

    const now = dependencies.now ?? new Date();
    const intent = await consumeLoginIntent(
      dependencies.intents,
      payload.data.intent,
      now
    );
    const profile = await dependencies.db.upsertProfile({
      supabaseUserId: user.data.id,
      email: user.data.email
    });
    const lifetimeMs =
      intent.duration === "THIRTY_DAYS"
        ? 30 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

    await dependencies.db.createSession({
      profileId: profile.id,
      supabaseSessionId: claims.data.session_id,
      expiresAt: new Date(now.getTime() + lifetimeMs)
    });

    return NextResponse.redirect(
      new URL("/", dependencies.appOrigin)
    );
  } catch {
    if (verificationCompleted) {
      return callbackFailure(
        dependencies.auth,
        dependencies.appOrigin,
        "invalid_link"
      );
    }

    return loginRedirect(dependencies.appOrigin, "invalid_link");
  }
}

function loginRedirect(appOrigin: string, error: string) {
  const destination = new URL("/login", appOrigin);
  destination.searchParams.set("error", error);
  return NextResponse.redirect(destination);
}

async function callbackFailure(
  auth: CallbackAuthAdapter,
  appOrigin: string,
  error: string
) {
  await auth.signOut({ scope: "local" }).catch(() => undefined);
  return loginRedirect(appOrigin, error);
}
