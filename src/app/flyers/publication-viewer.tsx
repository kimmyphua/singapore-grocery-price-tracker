export function PublicationViewer({
  title,
  publicationUrl
}: {
  title: string;
  publicationUrl: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-lilac bg-white p-6">
        <p className="font-bold text-ink">{title}</p>
        <p className="mt-1 text-sm text-slate-600">
          This publication opens in the official retailer viewer.
        </p>
      </div>
      <a
        href={publicationUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
      >
        Open publication
      </a>
    </div>
  );
}
