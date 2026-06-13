import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  discoverColdStorageEdition,
  discoverFairPriceEdition
} from "./sources";
import { FLYER_SOURCES } from "./seed";
import {
  deleteFlyerAsset,
  uploadFlyerPdf
} from "./storage";
import type {
  DiscoveredFlyerEdition,
  FlyerSourceKey
} from "./types";

type ActiveFlyerSource = {
  id: string;
  key: FlyerSourceKey;
  kind: "DIRECT_PDF" | "PUBLITAS";
  landingUrl: string;
  lastMetadataFingerprint: string | null;
};

type EditionInput = {
  sourceId: string;
  title: string;
  sourceUrl: string;
  directPdfUrl: string | null;
  storagePath: string | null;
  publicationUrl: string | null;
  assetKind: "PDF" | "PUBLICATION";
  contentHash: string;
  validFrom: Date | null;
  validTo: Date | null;
  firstSeenAt: Date;
  lastCheckedAt: Date;
};

export type FlyerRefreshStore = {
  upsertSources(): Promise<void>;
  listActiveSources(): Promise<ActiveFlyerSource[]>;
  findEdition(
    sourceId: string,
    contentHash: string
  ): Promise<{ id: string } | null>;
  createEdition(data: EditionInput): Promise<void>;
  touchEdition(id: string, checkedAt: Date): Promise<void>;
  updateSourceCheck(
    id: string,
    data: {
      checkedAt: Date;
      status: "CREATED" | "UNCHANGED" | "FAILED";
      errorMessage: string | null;
      metadataFingerprint?: string;
    }
  ): Promise<void>;
  listExpiredEditions(
    cutoff: Date
  ): Promise<Array<{ id: string; storagePath: string | null }>>;
  deleteEdition(id: string): Promise<void>;
};

type RefreshOptions = {
  store?: FlyerRefreshStore;
  now?: Date;
  discover?: (
    source: ActiveFlyerSource
  ) => Promise<DiscoveredFlyerEdition>;
  downloadPdf?: (url: string) => Promise<Uint8Array>;
  uploadPdf?: typeof uploadFlyerPdf;
  deleteAsset?: (storagePath: string) => Promise<void>;
};

export async function refreshFlyers(options: RefreshOptions = {}) {
  const store = options.store ?? createPrismaFlyerRefreshStore();
  const now = options.now ?? new Date();
  const discover = options.discover ?? discoverFlyerSource;
  const downloadPdf = options.downloadPdf ?? downloadFlyerPdf;
  const uploadPdf = options.uploadPdf ?? uploadFlyerPdf;
  const deleteAsset =
    options.deleteAsset ??
    ((storagePath: string) => deleteFlyerAsset({ storagePath }));

  await store.upsertSources();
  const sources = await store.listActiveSources();
  const summary = {
    checked: sources.length,
    created: 0,
    unchanged: 0,
    failed: 0,
    removed: 0
  };

  for (const source of sources) {
    try {
      const edition = await discover(source);
      if (
        source.lastMetadataFingerprint === edition.metadataFingerprint
      ) {
        await store.updateSourceCheck(source.id, {
          checkedAt: now,
          status: "UNCHANGED",
          errorMessage: null,
          metadataFingerprint: edition.metadataFingerprint
        });
        summary.unchanged += 1;
        continue;
      }

      const contentHash =
        edition.assetKind === "PDF"
          ? await resolvePdfHash(edition, downloadPdf)
          : { hash: edition.metadataFingerprint, bytes: null };
      const existing = await store.findEdition(source.id, contentHash.hash);

      if (existing) {
        await store.touchEdition(existing.id, now);
        await store.updateSourceCheck(source.id, {
          checkedAt: now,
          status: "UNCHANGED",
          errorMessage: null,
          metadataFingerprint: edition.metadataFingerprint
        });
        summary.unchanged += 1;
        continue;
      }

      const storagePath =
        edition.assetKind === "PDF" && contentHash.bytes
          ? await uploadPdf({
              sourceKey: edition.sourceKey,
              firstSeenAt: now,
              contentHash: contentHash.hash,
              bytes: contentHash.bytes
            })
          : null;
      await store.createEdition({
        sourceId: source.id,
        title: edition.title,
        sourceUrl: edition.sourceUrl,
        directPdfUrl: edition.directPdfUrl,
        storagePath,
        publicationUrl: edition.publicationUrl,
        assetKind: edition.assetKind,
        contentHash: contentHash.hash,
        validFrom: edition.validFrom,
        validTo: edition.validTo,
        firstSeenAt: now,
        lastCheckedAt: now
      });
      await store.updateSourceCheck(source.id, {
        checkedAt: now,
        status: "CREATED",
        errorMessage: null,
        metadataFingerprint: edition.metadataFingerprint
      });
      summary.created += 1;
    } catch (error) {
      await store.updateSourceCheck(source.id, {
        checkedAt: now,
        status: "FAILED",
        errorMessage: safeErrorMessage(error)
      });
      summary.failed += 1;
    }
  }

  const cutoff = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
  const expired = await store.listExpiredEditions(cutoff);
  for (const edition of expired) {
    if (edition.storagePath) {
      await deleteAsset(edition.storagePath);
    }
    await store.deleteEdition(edition.id);
    summary.removed += 1;
  }

  return summary;
}

async function resolvePdfHash(
  edition: DiscoveredFlyerEdition,
  downloadPdf: (url: string) => Promise<Uint8Array>
) {
  if (!edition.directPdfUrl) {
    throw new Error("Direct PDF edition is missing its PDF URL.");
  }
  const bytes = await downloadPdf(edition.directPdfUrl);
  return {
    bytes,
    hash: createHash("sha256").update(bytes).digest("hex")
  };
}

async function discoverFlyerSource(source: ActiveFlyerSource) {
  const headers = {
    "user-agent":
      process.env.SCRAPER_USER_AGENT ?? "SingaporeGroceryPriceTracker/0.1"
  };
  if (source.kind === "DIRECT_PDF") {
    const response = await fetch(source.landingUrl, { headers });
    if (!response.ok) {
      throw new Error(`Flyer source request failed with ${response.status}.`);
    }
    return discoverColdStorageEdition(await response.text());
  }

  const baseUrl = source.landingUrl.replace(/\/page\/\d+\/?$/, "");
  const [metadataResponse, spreadsResponse] = await Promise.all([
    fetch(`${baseUrl}/data.json`, { headers }),
    fetch(`${baseUrl}/spreads.json`, { headers })
  ]);
  if (!metadataResponse.ok || !spreadsResponse.ok) {
    throw new Error("FairPrice publication metadata request failed.");
  }
  return discoverFairPriceEdition(
    await metadataResponse.json(),
    await spreadsResponse.json()
  );
}

async function downloadFlyerPdf(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        process.env.SCRAPER_USER_AGENT ?? "SingaporeGroceryPriceTracker/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`Flyer PDF request failed with ${response.status}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") {
    throw new Error("Flyer PDF response was not a PDF.");
  }
  return bytes;
}

function createPrismaFlyerRefreshStore(): FlyerRefreshStore {
  return {
    async upsertSources() {
      for (const source of FLYER_SOURCES) {
        await prisma.flyerSource.upsert({
          where: { key: source.key },
          update: {
            title: source.title,
            landingUrl: source.landingUrl,
            kind: source.kind,
            isActive: true,
            retailer: { connect: { slug: source.retailerSlug } }
          },
          create: {
            key: source.key,
            title: source.title,
            landingUrl: source.landingUrl,
            kind: source.kind,
            retailer: { connect: { slug: source.retailerSlug } }
          }
        });
      }
    },
    async listActiveSources() {
      return (await prisma.flyerSource.findMany({
        where: { isActive: true },
        select: {
          id: true,
          key: true,
          kind: true,
          landingUrl: true,
          lastMetadataFingerprint: true
        },
        orderBy: { key: "asc" }
      })) as ActiveFlyerSource[];
    },
    async findEdition(sourceId, contentHash) {
      return prisma.flyerEdition.findUnique({
        where: { sourceId_contentHash: { sourceId, contentHash } },
        select: { id: true }
      });
    },
    async createEdition(data) {
      await prisma.flyerEdition.create({ data });
    },
    async touchEdition(id, checkedAt) {
      await prisma.flyerEdition.update({
        where: { id },
        data: { lastCheckedAt: checkedAt }
      });
    },
    async updateSourceCheck(id, data) {
      await prisma.flyerSource.update({
        where: { id },
        data: {
          lastCheckedAt: data.checkedAt,
          lastCheckStatus: data.status,
          lastErrorMessage: data.errorMessage,
          ...(data.metadataFingerprint
            ? { lastMetadataFingerprint: data.metadataFingerprint }
            : {})
        }
      });
    },
    async listExpiredEditions(cutoff) {
      return prisma.flyerEdition.findMany({
        where: { firstSeenAt: { lt: cutoff } },
        select: { id: true, storagePath: true },
        orderBy: { firstSeenAt: "asc" }
      });
    },
    async deleteEdition(id) {
      await prisma.flyerEdition.delete({ where: { id } });
    }
  };
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Flyer refresh failed.";
  }
  return error.message.slice(0, 300);
}
