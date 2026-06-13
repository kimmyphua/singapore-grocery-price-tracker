import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAppSession } from "@/lib/auth/session";
import { createFlyerDownloadUrl } from "@/lib/flyers/storage";

type DownloadDependencies = {
  requireSession: () => Promise<unknown>;
  findEdition: (
    id: string
  ) => Promise<{ assetKind: string; storagePath: string | null } | null>;
  createDownloadUrl: (storagePath: string) => Promise<string>;
};

export async function handleFlyerDownload(
  id: string,
  dependencies: DownloadDependencies
) {
  try {
    await dependencies.requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const edition = await dependencies.findEdition(id);
  if (
    !edition ||
    edition.assetKind !== "PDF" ||
    !edition.storagePath
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await dependencies.createDownloadUrl(edition.storagePath);
  return NextResponse.redirect(url);
}

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
