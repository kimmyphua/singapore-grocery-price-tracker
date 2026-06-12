import { refreshLatestPrices } from "@/lib/pricing/refresh-prices";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    await requireAppSession();
  } catch (error) {
    const response = appSessionErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }

  const body = (await request.json().catch(() => ({}))) as {
    productSlug?: string;
  };

  const result = await refreshLatestPrices({ productSlug: body.productSlug });
  return NextResponse.json(result, { status: 201 });
}
