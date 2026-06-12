import { NextResponse } from "next/server";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { approvePendingPromotionDeals } from "@/lib/promotions/review-actions";

export const runtime = "nodejs";

export async function PATCH() {
  try {
    await requireAppSession();
  } catch (error) {
    const response = appSessionErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }

  return NextResponse.json(await approvePendingPromotionDeals());
}
