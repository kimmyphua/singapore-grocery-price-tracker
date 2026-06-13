import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { getCachedLatestPrices } from "@/lib/pricing/cached-prices";
import { NextResponse } from "next/server";

export async function GET() {
  let session;
  try {
    session = await requireAppSession();
  } catch (error) {
    const response = appSessionErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }

  return NextResponse.json({
    prices: await getCachedLatestPrices(undefined, {
      ownerId: session.profileId
    })
  });
}
