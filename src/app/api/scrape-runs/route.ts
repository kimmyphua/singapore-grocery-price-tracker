import { createScrapeRunPayload } from "@/lib/api/payloads";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const scrapeRuns = await prisma.scrapeRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { retailer: true }
    });
    return NextResponse.json({ scrapeRuns });
  } catch {
    return NextResponse.json({ scrapeRuns: [], source: "seed-fallback" });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    retailerSlug?: string;
    query?: string;
  };

  if (!body.query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  return NextResponse.json(
    await createScrapeRunPayload(prisma, {
      retailerSlug: body.retailerSlug,
      query: body.query
    }),
    { status: 201 }
  );
}
