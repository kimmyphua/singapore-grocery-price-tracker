import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("flyer pages", () => {
  it("requires authentication and renders current editions plus history", () => {
    const source = readFileSync("src/app/flyers/page.tsx", "utf8");

    expect(source).toContain("requireProtectedPage()");
    expect(source).toContain("Current flyers");
    expect(source).toContain("12-week history");
    expect(source).toContain("/api/flyers/");
    expect(source).toContain("Download PDF");
    expect(source).toContain("Open publication");
  });

  it("provides PDF and publication viewer fallbacks", () => {
    const pdfViewer = readFileSync(
      "src/app/flyers/pdf-viewer.tsx",
      "utf8"
    );
    const publicationViewer = readFileSync(
      "src/app/flyers/publication-viewer.tsx",
      "utf8"
    );

    expect(pdfViewer).toContain("pdfjs-dist");
    expect(pdfViewer).toContain('workerSrc = "/pdf.worker.min.mjs"');
    expect(pdfViewer).not.toContain("import.meta.url");
    expect(pdfViewer).toContain("Unable to display this PDF");
    expect(publicationViewer).toContain("Open publication");
    expect(publicationViewer).toContain("could not be embedded");
  });

  it("adds Flyers to signed-in navigation", () => {
    const source = readFileSync("src/app/layout.tsx", "utf8");
    expect(source).toContain('href="/flyers"');
  });
});
