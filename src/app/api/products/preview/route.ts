import { z } from "zod";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireSameOrigin } from "@/lib/auth/request-security";
import { requireAppSession } from "@/lib/auth/session";
import {
  ProductPreviewError,
  previewProductUrl
} from "@/lib/products/preview";
import { UnsupportedProductUrlError } from "@/lib/products/url-policy";
import { NextResponse } from "next/server";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2048)
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  try {
    await requireAppSession();
  } catch (error) {
    const response = appSessionErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }

  const payload = requestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  try {
    return NextResponse.json(await previewProductUrl(payload.data.url));
  } catch (error) {
    if (
      error instanceof ProductPreviewError ||
      error instanceof UnsupportedProductUrlError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
