import { listLatestPricesPayload } from "@/lib/api/payloads";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(await listLatestPricesPayload(prisma));
}
