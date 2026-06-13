import { NextResponse } from "next/server";

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
