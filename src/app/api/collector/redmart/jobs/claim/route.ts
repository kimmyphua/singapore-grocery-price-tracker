import { NextResponse } from "next/server";
import { parseRedMartServerEnv } from "@/lib/env";
import {
  collectorUnauthorizedResponse,
  isCollectorAuthorized,
} from "@/lib/redmart/collector-auth";
import { claimRedMartJobs } from "@/lib/redmart/jobs";

export async function POST(request: Request) {
  const { collectorToken } = parseRedMartServerEnv(process.env);
  if (!isCollectorAuthorized(request, collectorToken)) {
    return collectorUnauthorizedResponse();
  }

  const jobs = await claimRedMartJobs(undefined, new Date(), 10);
  return NextResponse.json({ jobs });
}
