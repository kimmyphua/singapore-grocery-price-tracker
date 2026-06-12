import { NextResponse } from "next/server";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CATEGORIES = new Set(["SNACKS", "ICE_CREAM"]);
const REVIEW_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAppSession();
  } catch (error) {
    const response = appSessionErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.rawTitle === "string") {
    data.rawTitle = body.rawTitle.trim();
  }
  if (typeof body.category === "string" && CATEGORIES.has(body.category)) {
    data.category = body.category;
  }
  if ("packText" in body) {
    data.packText = toNullableString(body.packText);
  }
  if ("priceText" in body) {
    data.priceText = toNullableString(body.priceText);
  }
  if ("promoText" in body) {
    data.promoText = toNullableString(body.promoText);
  }
  if ("parsedPrice" in body) {
    data.parsedPrice = toNullableNumber(body.parsedPrice);
  }
  if (typeof body.reviewStatus === "string" && REVIEW_STATUSES.has(body.reviewStatus)) {
    data.reviewStatus = body.reviewStatus;
  }

  if (typeof data.rawTitle === "string" && data.rawTitle.length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const deal = await prisma.promotionDeal.update({
    where: { id: params.id },
    data,
    select: { id: true, reviewStatus: true }
  });
  return NextResponse.json(deal);
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === "") {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
