import { z } from "zod";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAppSession } from "@/lib/auth/session";
import {
  attachPendingRetailerListing,
  attachRetailerListing,
  detachRetailerListing,
  productMutationErrorResponse
} from "@/lib/products/mutations";
import { productPreviewSchema } from "@/lib/products/preview";
import { NextResponse } from "next/server";

type RouteContext = {
  params: { id: string };
};

const detachSchema = z.object({
  retailerId: z.string().trim().min(1).max(128)
});

const pendingListingSchema = z.object({
  url: z.string().trim().url(),
  pending: z.literal(true)
});

export async function POST(request: Request, context: RouteContext) {
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

  const body = await request.json().catch(() => null);
  const pendingPayload = pendingListingSchema.safeParse(body);
  const previewPayload = productPreviewSchema.safeParse(body);
  if (!pendingPayload.success && !previewPayload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  try {
    if (pendingPayload.success) {
      await attachPendingRetailerListing(
        undefined,
        session.profileId,
        context.params.id,
        pendingPayload.data.url
      );
      return NextResponse.json(
        { attached: true, pendingRefresh: true },
        { status: 201 }
      );
    }

    if (!previewPayload.success) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
    }

    await attachRetailerListing(
      undefined,
      session.profileId,
      context.params.id,
      previewPayload.data
    );
    return NextResponse.json({ attached: true }, { status: 201 });
  } catch (error) {
    const response = productMutationErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

  const payload = detachSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  try {
    await detachRetailerListing(
      undefined,
      session.profileId,
      context.params.id,
      payload.data.retailerId
    );
    return NextResponse.json({ detached: true });
  } catch (error) {
    const response = productMutationErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
