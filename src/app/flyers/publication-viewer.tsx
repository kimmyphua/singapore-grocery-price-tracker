"use client";

import { useEffect, useState } from "react";

export function PublicationViewer({
  title,
  publicationUrl
}: {
  title: string;
  publicationUrl: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      {!loaded && timedOut ? (
        <div className="rounded-2xl border border-lilac bg-white p-6">
          <p className="font-bold text-ink">
            This publication could not be embedded.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Open the official FairPrice viewer in a new tab instead.
          </p>
        </div>
      ) : (
        <iframe
          title={title}
          src={publicationUrl}
          onLoad={() => setLoaded(true)}
          className="h-[75vh] min-h-[560px] w-full rounded-2xl border border-lilac bg-white"
          allowFullScreen
        />
      )}
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
