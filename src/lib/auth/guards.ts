import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  AuthSessionError,
  requireAppSession
} from "@/lib/auth/session";

const LOGIN_STATE_ERROR_CODES = new Set([
  "SESSION_MISSING",
  "SESSION_INVALID"
]);

export async function requireProtectedPage() {
  try {
    return await requireAppSession();
  } catch (error) {
    if (
      error instanceof AuthSessionError &&
      LOGIN_STATE_ERROR_CODES.has(error.code)
    ) {
      redirect("/login");
    }

    throw error;
  }
}

export function appSessionErrorResponse(error: unknown) {
  if (!(error instanceof AuthSessionError)) {
    return null;
  }

  if (LOGIN_STATE_ERROR_CODES.has(error.code)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { error: "Authentication service unavailable" },
    { status: 503 }
  );
}
