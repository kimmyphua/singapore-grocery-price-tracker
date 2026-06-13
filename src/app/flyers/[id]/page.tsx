import { notFound } from "next/navigation";
import { requireProtectedPage } from "@/lib/auth/guards";
import { getFlyerEdition } from "@/lib/flyers/queries";
import { PdfViewer } from "../pdf-viewer";
import { PublicationViewer } from "../publication-viewer";

export default async function FlyerEditionPage({
  params
}: {
  params: { id: string };
}) {
  const { profileId } = await requireProtectedPage();
  const edition = await getFlyerEdition(params.id);
  void profileId;

  if (!edition) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <div>
        <a href="/flyers" className="text-sm font-bold text-coral">
          Back to flyers
        </a>
        <p className="mt-4 text-sm font-bold text-slate-500">
          {edition.source.retailer.name}
        </p>
        <h1 className="text-3xl font-extrabold text-ink">
          {edition.title}
        </h1>
      </div>

      {edition.assetKind === "PDF" ? (
        <PdfViewer
          downloadUrl={`/api/flyers/${edition.id}/download`}
        />
      ) : edition.publicationUrl ? (
        <PublicationViewer
          title={edition.title}
          publicationUrl={edition.publicationUrl}
        />
      ) : null}
    </div>
  );
}
