"use client";

import { useEffect, useRef, useState } from "react";

export function PdfViewer({ downloadUrl }: { downloadUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const document = await pdfjs.getDocument(downloadUrl).promise;
        const container = containerRef.current;
        if (!container || cancelled) {
          return;
        }
        container.replaceChildren();

        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = window.document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas is unavailable.");
          }
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto h-auto max-w-full rounded-xl bg-white shadow";
          container.append(canvas);
          await page.render({
            canvas,
            canvasContext: context,
            viewport
          }).promise;
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
    };
  }, [downloadUrl]);

  if (error) {
    return (
      <div className="rounded-2xl border border-coral bg-white p-6">
        <p className="font-bold text-ink">Unable to display this PDF.</p>
        <a
          href={downloadUrl}
          className="mt-3 inline-flex rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
        >
          Download PDF
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="space-y-5 rounded-2xl bg-lilac/20 p-3 sm:p-6"
      >
        <p className="text-center text-sm font-bold text-slate-500">
          Loading PDF…
        </p>
      </div>
      <a
        href={downloadUrl}
        className="inline-flex rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
      >
        Download PDF
      </a>
    </div>
  );
}
