import { listProductsPayload } from "@/lib/api/payloads";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireAppSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { prisma } from "@/lib/db";
import {
  createTrackedProduct,
  productMutationErrorResponse
} from "@/lib/products/mutations";
import { productPreviewSchema } from "@/lib/products/preview";
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

  return NextResponse.json(
    await listProductsPayload(prisma, session.profileId)
  );
}

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

  const payload = productPreviewSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  try {
    const product = await createTrackedProduct(
      undefined,
      session.profileId,
      payload.data
    );
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    const response = productMutationErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
