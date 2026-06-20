import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRedMartServerEnv } from "@/lib/env";
import {
  collectorUnauthorizedResponse,
  isCollectorAuthorized,
} from "@/lib/redmart/collector-auth";
import {
  completeRedMartJob,
  failRedMartJob,
  RedMartResultError,
} from "@/lib/redmart/jobs";

const parsedResultSchema = z.object({
  retailerSlug: z.literal("redmart"),
  titleRaw: z.string().trim().min(1),
  price: z.number().positive(),
  originalPrice: z.number().positive().nullable(),
  productUrl: z.string().url(),
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean(),
  retailerSku: z.string().trim().min(1),
  brandRaw: z.string().optional(),
  currency: z.string().optional(),
  promotionText: z.string().optional(),
  size: z.string().optional(),
});

const requestSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("COMPLETED"), result: parsedResultSchema }),
  z.object({
    status: z.literal("FAILED"),
    failure: z.object({
      category: z.enum([
        "BLOCKED",
        "TIMEOUT",
        "INVALID_RESPONSE",
        "IDENTITY_MISMATCH",
        "UNAVAILABLE",
        "INTERNAL",
      ]),
      message: z.string().min(1).max(1000),
    }),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { collectorToken } = parseRedMartServerEnv(process.env);
  if (!isCollectorAuthorized(request, collectorToken)) {
    return collectorUnauthorizedResponse();
  }

  const payload = requestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  try {
    if (payload.data.status === "COMPLETED") {
      await completeRedMartJob(undefined, params.id, payload.data.result);
    } else {
      await failRedMartJob(undefined, params.id, payload.data.failure);
    }
  } catch (error) {
    if (error instanceof RedMartResultError) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
