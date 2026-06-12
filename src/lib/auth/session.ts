import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthContext = {
  profileId: string;
  supabaseUserId: string;
  email: string;
  supabaseSessionId: string;
};

export type AuthSessionErrorCode =
  | "SESSION_MISSING"
  | "SESSION_EXPIRED"
  | "SESSION_INVALID";

export class AuthSessionError extends Error {
  readonly code: AuthSessionErrorCode;

  constructor(code: AuthSessionErrorCode, message: string) {
    super(message);
    this.name = "AuthSessionError";
    this.code = code;
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
  getClaims(): Promise<{
    data: { claims: unknown } | null;
    error: unknown;
  }>;
  signOut(options: { scope: "local" }): Promise<unknown>;
};

type AppSessionDb = {
  upsertProfile(input: {
    supabaseUserId: string;
    email: string;
  }): Promise<{ id: string }>;
  findSession(supabaseSessionId: string): Promise<{
    profileId: string;
    expiresAt: Date;
  } | null>;
};

type RequireAppSessionDependencies = {
  now?: Date;
  auth?: AuthAdapter;
  db?: AppSessionDb;
};

const verifiedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email()
});

const verifiedClaimsSchema = z.object({
  sub: z.string().uuid(),
  session_id: z.string().uuid()
});

const prismaSessionDb: AppSessionDb = {
  upsertProfile({ supabaseUserId, email }) {
    return prisma.userProfile.upsert({
      where: { supabaseUserId },
      create: { supabaseUserId, email },
      update: { email },
      select: { id: true }
    });
  },
  findSession(supabaseSessionId) {
    return prisma.appSession.findUnique({
      where: { supabaseSessionId },
      select: {
        profileId: true,
        expiresAt: true
      }
    });
  }
};

export async function requireAppSession(
  dependencies: RequireAppSessionDependencies = {}
): Promise<AuthContext> {
  const auth =
    dependencies.auth ?? (await createSupabaseServerClient()).auth;
  const db = dependencies.db ?? prismaSessionDb;
  const now = dependencies.now ?? new Date();

  let userResult: Awaited<ReturnType<AuthAdapter["getUser"]>>;
  try {
    userResult = await auth.getUser();
  } catch {
    throw new AuthSessionError(
      "SESSION_MISSING",
      "An authenticated Supabase user is required."
    );
  }

  if (userResult.error || !userResult.data.user) {
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

  let claimsResult: Awaited<ReturnType<AuthAdapter["getClaims"]>>;
  try {
    claimsResult = await auth.getClaims();
  } catch {
    throw new AuthSessionError(
      "SESSION_INVALID",
      "Supabase session claims could not be verified."
    );
  }

  if (claimsResult.error || !claimsResult.data) {
    throw new AuthSessionError(
      "SESSION_INVALID",
      "Supabase session claims could not be verified."
    );
  }

  const claims = verifiedClaimsSchema.safeParse(claimsResult.data.claims);
  if (!claims.success || claims.data.sub !== user.data.id) {
    throw new AuthSessionError(
      "SESSION_INVALID",
      "The verified Supabase session does not match the current user."
    );
  }

  const profile = await db.upsertProfile({
    supabaseUserId: user.data.id,
    email: user.data.email
  });
  const appSession = await db.findSession(claims.data.session_id);

  if (!appSession || appSession.profileId !== profile.id) {
    throw new AuthSessionError(
      "SESSION_INVALID",
      "The application session is invalid."
    );
  }

  if (appSession.expiresAt.getTime() <= now.getTime()) {
    await auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new AuthSessionError(
      "SESSION_EXPIRED",
      "The application session has expired."
    );
  }

  return {
    profileId: profile.id,
    supabaseUserId: user.data.id,
    email: user.data.email,
    supabaseSessionId: claims.data.session_id
  };
}
