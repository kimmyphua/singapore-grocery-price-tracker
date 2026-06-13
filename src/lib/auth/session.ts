import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthContext = {
  profileId: string;
  supabaseUserId: string;
  email: string;
};

export type AuthSessionErrorCode =
  | "SESSION_MISSING"
  | "SESSION_INVALID"
  | "SESSION_PROVIDER_ERROR";

export type AuthProviderErrorCause = {
  name: string;
  status?: number;
  code?: string;
};

export class AuthSessionError extends Error {
  readonly code: AuthSessionErrorCode;
  override readonly cause?: AuthProviderErrorCause;

  constructor(
    code: AuthSessionErrorCode,
    message: string,
    cause?: AuthProviderErrorCause
  ) {
    super(message);
    this.name = "AuthSessionError";
    this.code = code;
    this.cause = cause;
  }
}

type VerifiedUser = {
  id: string;
  email?: string;
};

type AuthAdapter = {
  getUser(): Promise<{
    data: { user: VerifiedUser | null };
    error: unknown;
  }>;
};

type ProfileDb = {
  upsertProfile(input: {
    supabaseUserId: string;
    email: string;
  }): Promise<{ id: string }>;
};

type RequireAppSessionDependencies = {
  auth?: AuthAdapter;
  db?: ProfileDb;
};

const verifiedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email()
});

const authErrorSchema = z.object({
  name: z.string().optional(),
  status: z.number().optional(),
  code: z.string().optional()
});

function sanitizeProviderCause(error: unknown): AuthProviderErrorCause {
  const parsed = authErrorSchema.safeParse(error);

  if (!parsed.success) {
    return { name: "UnknownProviderError" };
  }

  return {
    name: parsed.data.name ?? "UnknownProviderError",
    ...(parsed.data.status === undefined
      ? {}
      : { status: parsed.data.status }),
    ...(parsed.data.code === undefined ? {} : { code: parsed.data.code })
  };
}

function authErrorCode(error: unknown): AuthSessionErrorCode {
  const parsed = authErrorSchema.safeParse(error);

  if (!parsed.success) {
    return "SESSION_PROVIDER_ERROR";
  }

  if (parsed.data.name === "AuthSessionMissingError") {
    return "SESSION_MISSING";
  }

  if (
    parsed.data.name === "AuthInvalidJwtError" ||
    (parsed.data.status !== undefined &&
      parsed.data.status >= 400 &&
      parsed.data.status < 500 &&
      parsed.data.status !== 429)
  ) {
    return "SESSION_INVALID";
  }

  return "SESSION_PROVIDER_ERROR";
}

function throwAuthResultError(error: unknown): never {
  const code = authErrorCode(error);

  if (code === "SESSION_MISSING") {
    throw new AuthSessionError(
      code,
      "An authenticated Supabase user is required."
    );
  }

  if (code === "SESSION_INVALID") {
    throw new AuthSessionError(code, "The Supabase session is invalid.");
  }

  throw new AuthSessionError(
    code,
    "The authentication provider is temporarily unavailable.",
    sanitizeProviderCause(error)
  );
}

function throwProviderError(error: unknown): never {
  throw new AuthSessionError(
    "SESSION_PROVIDER_ERROR",
    "The authentication provider is temporarily unavailable.",
    sanitizeProviderCause(error)
  );
}

const prismaProfileDb: ProfileDb = {
  upsertProfile({ supabaseUserId, email }) {
    return prisma.userProfile.upsert({
      where: { supabaseUserId },
      create: { supabaseUserId, email },
      update: { email },
      select: { id: true }
    });
  }
};

export async function requireAppSession(
  dependencies: RequireAppSessionDependencies = {}
): Promise<AuthContext> {
  const auth =
    dependencies.auth ?? (await createSupabaseServerClient()).auth;
  const db = dependencies.db ?? prismaProfileDb;

  let userResult: Awaited<ReturnType<AuthAdapter["getUser"]>>;
  try {
    userResult = await auth.getUser();
  } catch (error) {
    throwProviderError(error);
  }

  if (userResult.error) {
    throwAuthResultError(userResult.error);
  }

  if (!userResult.data.user) {
    throw new AuthSessionError(
      "SESSION_MISSING",
      "An authenticated Supabase user is required."
    );
  }

  const user = verifiedUserSchema.safeParse(userResult.data.user);
  if (!user.success) {
    throw new AuthSessionError(
      "SESSION_INVALID",
      "The verified Supabase user is invalid."
    );
  }

  const profile = await db.upsertProfile({
    supabaseUserId: user.data.id,
    email: user.data.email
  });

  return {
    profileId: profile.id,
    supabaseUserId: user.data.id,
    email: user.data.email
  };
}
