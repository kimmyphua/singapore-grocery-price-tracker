import { describe, expect, it, vi } from "vitest";
import {
  buildFlyerStoragePath,
  createFlyerDownloadUrl,
  deleteFlyerAsset,
  uploadFlyerPdf
} from "@/lib/flyers/storage";

function storageClient() {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example/signed.pdf" },
    error: null
  });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const from = vi.fn(() => ({ upload, createSignedUrl, remove }));
  return { client: { storage: { from } }, from, upload, createSignedUrl, remove };
}

describe("flyer storage", () => {
  it("builds a deterministic dated path", () => {
    expect(
      buildFlyerStoragePath(
        "cold-storage-grocery-selections",
        new Date("2026-06-11T03:00:00.000Z"),
        "abc123"
      )
    ).toBe("cold-storage-grocery-selections/2026-06-11/abc123.pdf");
  });

  it("uploads a PDF without overwriting an existing asset", async () => {
    const storage = storageClient();
    const path = await uploadFlyerPdf({
      client: storage.client,
      bucket: "flyers",
      sourceKey: "cold-storage-grocery-selections",
      firstSeenAt: new Date("2026-06-11T03:00:00.000Z"),
      contentHash: "abc123",
      bytes: new Uint8Array([37, 80, 68, 70])
    });

    expect(path).toBe(
      "cold-storage-grocery-selections/2026-06-11/abc123.pdf"
    );
    expect(storage.from).toHaveBeenCalledWith("flyers");
    expect(storage.upload).toHaveBeenCalledWith(
      path,
      expect.any(Uint8Array),
      { contentType: "application/pdf", upsert: false }
    );
  });

  it("creates a short-lived signed download URL", async () => {
    const storage = storageClient();

    await expect(
      createFlyerDownloadUrl({
        client: storage.client,
        bucket: "flyers",
        storagePath: "source/2026-06-11/hash.pdf"
      })
    ).resolves.toBe("https://storage.example/signed.pdf");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      "source/2026-06-11/hash.pdf",
      60
    );
  });

  it("deletes only the requested owned storage path", async () => {
    const storage = storageClient();

    await deleteFlyerAsset({
      client: storage.client,
      bucket: "flyers",
      storagePath: "source/2026-06-11/hash.pdf"
    });

    expect(storage.remove).toHaveBeenCalledWith([
      "source/2026-06-11/hash.pdf"
    ]);
  });
});
