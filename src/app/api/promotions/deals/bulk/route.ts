import { NextResponse } from "next/server";
import { approvePendingPromotionDeals } from "@/lib/promotions/review-actions";

export const runtime = "nodejs";

export async function PATCH() {
  return NextResponse.json(await approvePendingPromotionDeals());
}
