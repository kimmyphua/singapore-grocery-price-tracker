import { z } from "zod";
import { refreshOwnerListings } from "@/lib/pricing/refresh-prices";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { NextResponse } from "next/server";
import { queueOwnerRedMartRefreshes } from "@/lib/redmart/jobs";

export const preferredRegion = "sin1";

const requestSchema = z.object({
  trackedProductId: z.string().trim().min(1).optional()
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

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

  const payload = requestSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  const immediate = await refreshOwnerListings(
    undefined,
    session.profileId,
    payload.data.trackedProductId
  );
  const redmart = await queueOwnerRedMartRefreshes(
    undefined,
    session.profileId,
    session.profileId,
    payload.data.trackedProductId,
  );
  return NextResponse.json({ immediate, redmart }, { status: 201 });
}
