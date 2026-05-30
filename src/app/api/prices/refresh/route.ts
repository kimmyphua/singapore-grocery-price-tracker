import { refreshLatestPrices } from "@/lib/pricing/refresh-prices";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    productSlug?: string;
  };

  const result = await refreshLatestPrices({ productSlug: body.productSlug });
  return NextResponse.json(result, { status: 201 });
}
