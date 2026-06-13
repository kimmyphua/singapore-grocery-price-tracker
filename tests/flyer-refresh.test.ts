import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  refreshFlyers,
  type FlyerRefreshStore
} from "@/lib/flyers/refresh";
import type { DiscoveredFlyerEdition } from "@/lib/flyers/types";

const now = new Date("2026-06-13T04:00:00.000Z");
const pdfBytes = new TextEncoder().encode("%PDF-current");
const pdfHash = createHash("sha256").update(pdfBytes).digest("hex");

const coldEdition: DiscoveredFlyerEdition = {
  sourceKey: "cold-storage-grocery-selections",
  title: "Grocery Selections (Till 17 June)",
  sourceUrl:
    "https://coldstorage.com.sg/weekly-ads/Grocery-Selections",
  directPdfUrl: "https://csp.coldstorage.com.sg/media/weeklydeals/current.pdf",
  publicationUrl: null,
  assetKind: "PDF",
  validFrom: new Date("2026-06-10T16:00:00.000Z"),
  validTo: new Date("2026-06-17T15:59:59.999Z"),
  metadataFingerprint: "metadata-cold"
};

const fairPriceEdition: DiscoveredFlyerEdition = {
  sourceKey: "fairprice-weekly-savers",
  title: "Price Drop Buy Now - Weekly Savers {11 Jun - 17 Jun 2026}",
  sourceUrl:
    "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1",
  directPdfUrl: null,
  publicationUrl:
    "https://promotions.fairprice.com.sg/price-drop-buy-now-weekly-savers/page/1",
  assetKind: "PUBLICATION",
  validFrom: new Date("2026-06-10T16:00:00.000Z"),
  validTo: new Date("2026-06-17T15:59:59.999Z"),
  metadataFingerprint: "metadata-fairprice"
};

function createStore(
  overrides: Partial<FlyerRefreshStore> = {}
): FlyerRefreshStore {
  return {
    upsertSources: vi.fn().mockResolvedValue(undefined),
    listActiveSources: vi.fn().mockResolvedValue([
      {
        id: "cold",
        key: "cold-storage-grocery-selections",
        kind: "DIRECT_PDF",
        landingUrl: coldEdition.sourceUrl,
        lastMetadataFingerprint: null
      },
      {
        id: "fairprice",
        key: "fairprice-weekly-savers",
        kind: "PUBLITAS",
        landingUrl: fairPriceEdition.sourceUrl,
        lastMetadataFingerprint: null
      }
    ]),
    findEdition: vi.fn().mockResolvedValue(null),
    createEdition: vi.fn().mockResolvedValue(undefined),
    touchEdition: vi.fn().mockResolvedValue(undefined),
    updateSourceCheck: vi.fn().mockResolvedValue(undefined),
    listExpiredEditions: vi.fn().mockResolvedValue([]),
    deleteEdition: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("flyer refresh", () => {
  it("skips downloading when the metadata fingerprint is unchanged", async () => {
    const downloadPdf = vi.fn();
    const store = createStore({
      listActiveSources: vi.fn().mockResolvedValue([
        {
          id: "cold",
          key: "cold-storage-grocery-selections",
          kind: "DIRECT_PDF",
          landingUrl: coldEdition.sourceUrl,
          lastMetadataFingerprint: "metadata-cold"
        }
      ])
    });

    await refreshFlyers({
      store,
      now,
      discover: vi.fn().mockResolvedValue(coldEdition),
      downloadPdf
    });

    expect(downloadPdf).not.toHaveBeenCalled();
    expect(store.createEdition).not.toHaveBeenCalled();
  });

  it("skips upload and creation when downloaded PDF bytes already exist", async () => {
    const store = createStore({
      listActiveSources: vi.fn().mockResolvedValue([
        {
          id: "cold",
          key: "cold-storage-grocery-selections",
          kind: "DIRECT_PDF",
          landingUrl: coldEdition.sourceUrl,
          lastMetadataFingerprint: null
        }
      ]),
      findEdition: vi.fn().mockResolvedValue({ id: "existing" })
    });
    const uploadPdf = vi.fn();

    await refreshFlyers({
      store,
      now,
      discover: vi.fn().mockResolvedValue(coldEdition),
      downloadPdf: vi.fn().mockResolvedValue(pdfBytes),
      uploadPdf
    });

    expect(store.findEdition).toHaveBeenCalledWith("cold", pdfHash);
    expect(uploadPdf).not.toHaveBeenCalled();
    expect(store.touchEdition).toHaveBeenCalledWith("existing", now);
  });

  it("stores a changed PDF edition", async () => {
    const store = createStore({
      listActiveSources: vi.fn().mockResolvedValue([
        {
          id: "cold",
          key: "cold-storage-grocery-selections",
          kind: "DIRECT_PDF",
          landingUrl: coldEdition.sourceUrl,
          lastMetadataFingerprint: null
        }
      ])
    });
    const uploadPdf = vi
      .fn()
      .mockResolvedValue("cold-storage/2026-06-13/hash.pdf");

    await refreshFlyers({
      store,
      now,
      discover: vi.fn().mockResolvedValue(coldEdition),
      downloadPdf: vi.fn().mockResolvedValue(pdfBytes),
      uploadPdf
    });

    expect(uploadPdf).toHaveBeenCalledWith(
      expect.objectContaining({ contentHash: pdfHash, bytes: pdfBytes })
    );
    expect(store.createEdition).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "cold",
        assetKind: "PDF",
        contentHash: pdfHash,
        storagePath: "cold-storage/2026-06-13/hash.pdf"
      })
    );
  });

  it("stores Publitas metadata without uploading a PDF", async () => {
    const store = createStore({
      listActiveSources: vi.fn().mockResolvedValue([
        {
          id: "fairprice",
          key: "fairprice-weekly-savers",
          kind: "PUBLITAS",
          landingUrl: fairPriceEdition.sourceUrl,
          lastMetadataFingerprint: null
        }
      ])
    });
    const uploadPdf = vi.fn();

    await refreshFlyers({
      store,
      now,
      discover: vi.fn().mockResolvedValue(fairPriceEdition),
      uploadPdf
    });

    expect(uploadPdf).not.toHaveBeenCalled();
    expect(store.createEdition).toHaveBeenCalledWith(
      expect.objectContaining({
        assetKind: "PUBLICATION",
        contentHash: "metadata-fairprice",
        storagePath: null
      })
    );
  });

  it("continues when one source fails", async () => {
    const store = createStore();
    const discover = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cold Storage unavailable"))
      .mockResolvedValueOnce(fairPriceEdition);

    await expect(
      refreshFlyers({ store, now, discover })
    ).resolves.toMatchObject({ checked: 2, failed: 1, created: 1 });
    expect(store.updateSourceCheck).toHaveBeenCalledWith(
      "cold",
      expect.objectContaining({ status: "FAILED" })
    );
  });

  it("removes stored editions older than 12 weeks", async () => {
    const store = createStore({
      listActiveSources: vi.fn().mockResolvedValue([]),
      listExpiredEditions: vi.fn().mockResolvedValue([
        { id: "old-pdf", storagePath: "cold/old.pdf" },
        { id: "old-publication", storagePath: null }
      ])
    });
    const deleteAsset = vi.fn().mockResolvedValue(undefined);

    await expect(
      refreshFlyers({ store, now, deleteAsset })
    ).resolves.toMatchObject({ removed: 2 });
    expect(store.listExpiredEditions).toHaveBeenCalledWith(
      new Date("2026-03-21T04:00:00.000Z")
    );
    expect(deleteAsset).toHaveBeenCalledWith("cold/old.pdf");
    expect(store.deleteEdition).toHaveBeenCalledTimes(2);
  });
});
