import { NextResponse } from "next/server";
import {
  refreshWeeklyPromotions,
  type PromotionRefreshResult
} from "@/lib/promotions/refresh-promotions";
import type { PromotionRetailerSlug } from "@/lib/promotions/types";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";

const RETAILER_SLUGS = new Set(["fairprice", "giant", "sheng-siong", "cold-storage"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const retailerSlug = typeof body.retailerSlug === "string" ? body.retailerSlug : undefined;
  if (retailerSlug && !RETAILER_SLUGS.has(retailerSlug)) {
    return NextResponse.json({ error: "Unsupported retailerSlug" }, { status: 400 });
  }

  const result: PromotionRefreshResult = await refreshWeeklyPromotions({
    retailerSlug: retailerSlug as PromotionRetailerSlug | undefined
  });
  return NextResponse.json(result);
}
