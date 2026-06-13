import { requireProtectedPage } from "@/lib/auth/guards";
import { getFlyerLibrary } from "@/lib/flyers/queries";

export default async function FlyersPage() {
  const { profileId } = await requireProtectedPage();
  const sources = await getFlyerLibrary();
  void profileId;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-extrabold uppercase tracking-wide text-coral">
          Shared supermarket publications
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">
          Current flyers
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Browse the latest Cold Storage and FairPrice editions. Flyer
          content is shared and does not affect tracked product prices.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {sources.map((source) => (
          <article
            key={source.id}
            className="rounded-3xl border border-sage bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-bold text-slate-500">
              {source.retailer.name}
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">
              {source.currentEdition?.title ?? source.title}
            </h2>
            {source.currentEdition ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={`/flyers/${source.currentEdition.id}`}
                  className="rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
                >
                  View flyer
                </a>
                {source.currentEdition.assetKind === "PDF" ? (
                  <a
                    href={`/api/flyers/${source.currentEdition.id}/download`}
                    className="rounded-full border border-lilac px-5 py-2 text-sm font-bold text-ink"
                  >
                    Download PDF
                  </a>
                ) : (
                  <a
                    href={source.currentEdition.publicationUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-lilac px-5 py-2 text-sm font-bold text-ink"
                  >
                    Open publication
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No edition has been saved yet.
              </p>
            )}
          </article>
        ))}
      </section>

      <section>
        <h2 className="text-2xl font-extrabold text-ink">
          12-week history
        </h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-sage bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-sage/35 text-ink">
              <tr>
                <th className="px-4 py-3">Retailer</th>
                <th className="px-4 py-3">Edition</th>
                <th className="px-4 py-3">First saved</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {sources.flatMap((source) =>
                source.editions.map((edition) => (
                  <tr key={edition.id} className="border-t border-sage">
                    <td className="px-4 py-3 font-bold text-ink">
                      {source.retailer.name}
                    </td>
                    <td className="px-4 py-3">{edition.title}</td>
                    <td className="px-4 py-3">
                      {edition.firstSeenAt.toLocaleDateString("en-SG")}
                    </td>
                    <td className="px-4 py-3">
                      {edition.assetKind === "PDF" ? (
                        <a
                          href={`/api/flyers/${edition.id}/download`}
                          className="font-bold text-coral"
                        >
                          Download PDF
                        </a>
                      ) : (
                        <a
                          href={edition.publicationUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-coral"
                        >
                          Open publication
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
