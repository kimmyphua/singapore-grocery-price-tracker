import { describe, expect, it, vi } from "vitest";
import { handleFlyerDownload } from "@/lib/flyers/download";

describe("flyer download route", () => {
  it("rejects signed-out users", async () => {
    const response = await handleFlyerDownload("edition-1", {
      requireSession: vi.fn().mockRejectedValue(new Error("signed out")),
      findEdition: vi.fn(),
      createDownloadUrl: vi.fn()
    });

    expect(response.status).toBe(401);
  });

  it("returns a signed redirect for stored PDFs", async () => {
    const response = await handleFlyerDownload("edition-1", {
      requireSession: vi.fn().mockResolvedValue({ profileId: "profile-1" }),
      findEdition: vi.fn().mockResolvedValue({
        assetKind: "PDF",
        storagePath: "cold/edition.pdf"
      }),
      createDownloadUrl: vi
        .fn()
        .mockResolvedValue("https://storage.example/signed.pdf")
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://storage.example/signed.pdf"
    );
  });

  it("does not create downloads for publications", async () => {
    const response = await handleFlyerDownload("edition-1", {
      requireSession: vi.fn().mockResolvedValue({ profileId: "profile-1" }),
      findEdition: vi.fn().mockResolvedValue({
        assetKind: "PUBLICATION",
        storagePath: null
      }),
      createDownloadUrl: vi.fn()
    });

    expect(response.status).toBe(404);
  });

  it("returns not found when the stored PDF object is missing", async () => {
    const response = await handleFlyerDownload("edition-1", {
      requireSession: vi.fn().mockResolvedValue({ profileId: "profile-1" }),
      findEdition: vi.fn().mockResolvedValue({
        assetKind: "PDF",
        storagePath: "cold/missing.pdf"
      }),
      createDownloadUrl: vi
        .fn()
        .mockRejectedValue(new Error("Flyer signed URL failed: Object not found"))
    });

    expect(response.status).toBe(404);
  });
});
