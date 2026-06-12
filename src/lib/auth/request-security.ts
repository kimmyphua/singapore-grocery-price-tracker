import { NextResponse } from "next/server";
import { parseAuthServerEnv } from "@/lib/env";

export function requireSameOrigin(
  request: Request,
  configuredOrigin = parseAuthServerEnv(process.env).appOrigin
) {
  const origin = request.headers.get("origin");

  if (origin !== configuredOrigin) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  return null;
}
