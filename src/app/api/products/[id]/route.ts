import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAppSession } from "@/lib/auth/session";
import {
  deleteTrackedProduct,
  editableProductFieldsSchema,
  productMutationErrorResponse,
  updateTrackedProduct
} from "@/lib/products/mutations";
import { NextResponse } from "next/server";

type RouteContext = {
  params: { id: string };
};

export async function PATCH(request: Request, context: RouteContext) {
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

  const payload = editableProductFieldsSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  try {
    await updateTrackedProduct(
      undefined,
      session.profileId,
      context.params.id,
      payload.data
    );
    return NextResponse.json({ updated: true });
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

  try {
    await deleteTrackedProduct(
      undefined,
      session.profileId,
      context.params.id
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const response = productMutationErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
