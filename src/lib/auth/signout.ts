import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type SignOutAuthAdapter = {
  getClaims(): Promise<{
    data: { claims: unknown } | null;
    error: unknown;
  }>;
  signOut(options: {
    scope: "local";
  }): Promise<{ error?: unknown } | unknown>;
};

type SignOutDb = {
  deleteSession(supabaseSessionId: string): Promise<void>;
};

export type SignOutDependencies = {
  appOrigin: string;
  auth: SignOutAuthAdapter;
  db: SignOutDb;
};

const sessionClaimsSchema = z.object({
  session_id: z.string().uuid()
});

export const prismaSignOutDb: SignOutDb = {
  async deleteSession(supabaseSessionId) {
    await prisma.appSession.deleteMany({
      where: { supabaseSessionId }
    });
  }
};

export async function handleSignOut(
  request: Request,
  dependencies: SignOutDependencies
) {
  try {
    const claimsResult = await dependencies.auth.getClaims();
    const claims = sessionClaimsSchema.safeParse(
      claimsResult.data?.claims
    );

    if (!claimsResult.error && claims.success) {
      await dependencies.db.deleteSession(claims.data.session_id);
    }
  } catch {
    // Local sign-out still runs when application-session cleanup fails.
  }

  await dependencies.auth
    .signOut({ scope: "local" })
    .catch(() => undefined);

  return NextResponse.redirect(
    new URL("/login", dependencies.appOrigin),
    303
  );
}
