import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAppSession } from "@/lib/auth/session";
import { handleFlyerDownload } from "@/lib/flyers/download";
import { createFlyerDownloadUrl } from "@/lib/flyers/storage";

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  try {
    await requireAppSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleFlyerDownload(context.params.id, {
    requireSession: async () => undefined,
    findEdition(id) {
      return prisma.flyerEdition.findUnique({
        where: { id },
        select: { assetKind: true, storagePath: true }
      });
    },
    createDownloadUrl(storagePath) {
      return createFlyerDownloadUrl({ storagePath });
    }
  });
}
