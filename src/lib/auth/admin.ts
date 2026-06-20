import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { parseRedMartServerEnv } from "@/lib/env";
import { requireProtectedPage } from "@/lib/auth/guards";
import { requireAppSession, type AuthContext } from "@/lib/auth/session";

export class AdminAuthorizationError extends Error {
  constructor() {
    super("Administrator access is required.");
    this.name = "AdminAuthorizationError";
  }
}

export function isAdminEmail(email: string, allowlist: string[]) {
  return allowlist.includes(email.trim().toLowerCase());
}

export async function requireAdminPage(): Promise<AuthContext> {
  const session = await requireProtectedPage();
  const { adminEmails } = parseRedMartServerEnv(process.env);
  if (!isAdminEmail(session.email, adminEmails)) {
    redirect("/");
  }
  return session;
}

export async function requireAdminSession(): Promise<AuthContext> {
  const session = await requireAppSession();
  const { adminEmails } = parseRedMartServerEnv(process.env);
  if (!isAdminEmail(session.email, adminEmails)) {
    throw new AdminAuthorizationError();
  }
  return session;
}

export function adminAuthorizationErrorResponse(error: unknown) {
  if (!(error instanceof AdminAuthorizationError)) {
    return null;
  }
  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
}
