import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function isCollectorAuthorized(
  request: Request,
  expectedToken: string,
) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function collectorUnauthorizedResponse() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}
