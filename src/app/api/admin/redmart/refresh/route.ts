import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminAuthorizationErrorResponse,
  requireAdminSession,
} from "@/lib/auth/admin";
import { appSessionErrorResponse } from "@/lib/auth/guards";
import { requireSameOrigin } from "@/lib/auth/request-security";
import {
  queueAllRedMartRefreshes,
  retryRedMartRefresh,
} from "@/lib/redmart/jobs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("queue-all") }),
  z.object({ action: z.literal("retry"), jobId: z.string().trim().min(1) }),
]);

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  let session;
  try {
    session = await requireAdminSession();
  } catch (error) {
    const response =
      appSessionErrorResponse(error) ?? adminAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const payload = requestSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!payload.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 422 });
  }

  const result =
    payload.data.action === "queue-all"
      ? await queueAllRedMartRefreshes(undefined, session.profileId)
      : await retryRedMartRefresh(
          undefined,
          payload.data.jobId,
          session.profileId,
        );
  return NextResponse.json(result, { status: 201 });
}
