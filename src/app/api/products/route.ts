import { listProductsPayload } from "@/lib/api/payloads";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAppSession();
  } catch (error) {
    const response = appSessionErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }

  return NextResponse.json(await listProductsPayload(prisma));
}
