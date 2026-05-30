import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { parsePromotionAsset } from "./parser";
import { discoverPromotionSources } from "./sources";
import type {
  ExtractedPromotionDeal,
  PromotionRetailerSlug,
  PromotionSource
} from "./types";

type PromotionRefreshOptions = {
  retailerSlug?: PromotionRetailerSlug;
};

type PromotionAsset = {
  bytes: Buffer;
  contentType: string | null;
};

type PromotionRefreshClient = {
  retailer: {
    findUnique(args: { where: { slug: string }; select?: { id: true } }): Promise<{ id: string } | null>;
  };
  promotionFlyer: {
    findUnique(args: {
      where: { assetHash: string };
      select?: Record<string, unknown>;
    }): Promise<{
      id: string;
      status?: string;
      assetPath?: string;
      _count?: { deals: number };
    } | null>;
    create(args: { data: Record<string, unknown>; select?: { id: true } }): Promise<{ id: string }>;
    update?(args: {
      where: { id: string };
      data: Record<string, unknown>;
      select?: { id: true };
    }): Promise<{ id: string }>;
  };
  promotionDeal: {
    findMany?(args: {
      where: { flyerId: string };
      select: {
        rawTitle: true;
        priceText: true;
        promoText: true;
        pageNumber: true;
      };
    }): Promise<
      Array<{
        rawTitle: string;
        priceText: string | null;
        promoText: string | null;
        pageNumber: number;
      }>
    >;
    createMany(args: { data: any[] }): Promise<{ count: number }>;
  };
};

type PromotionRefreshDeps = {
  client?: PromotionRefreshClient;
  discoverSources?: (options: PromotionRefreshOptions) => Promise<PromotionSource[]>;
  fetchAsset?: (source: PromotionSource) => Promise<PromotionAsset>;
  parseAsset?: (input: {
    assetBytes: Buffer;
    assetKind: PromotionSource["assetKind"];
    assetUrl: string;
  }) => Promise<ExtractedPromotionDeal[]>;
  writeAsset?: (
    source: PromotionSource,
    bytes: Buffer,
    contentType: string | null,
    hash: string
  ) => Promise<string>;
};

export type PromotionRefreshResult = {
  flyersFetched: number;
  duplicatesSkipped: number;
  candidatesCreated: number;
  parseFailures: number;
};

export async function refreshWeeklyPromotions(
  options: PromotionRefreshOptions = {},
  deps: PromotionRefreshDeps = {}
): Promise<PromotionRefreshResult> {
  const client: PromotionRefreshClient = deps.client ?? (prisma as unknown as PromotionRefreshClient);
  const discoverSourcesForRefresh = deps.discoverSources ?? discoverPromotionSources;
  const fetchAsset = deps.fetchAsset ?? fetchPromotionAsset;
  const parseAsset = deps.parseAsset ?? parsePromotionAsset;
  const writeAsset = deps.writeAsset ?? writePromotionAsset;
  const result: PromotionRefreshResult = {
    flyersFetched: 0,
    duplicatesSkipped: 0,
    candidatesCreated: 0,
    parseFailures: 0
  };

  const sources = await discoverSourcesForRefresh(options);
  for (const source of sources) {
    const retailer = await client.retailer.findUnique({
      where: { slug: source.retailerSlug },
      select: { id: true }
    });
    if (!retailer) {
      result.parseFailures += 1;
      continue;
    }

    try {
      const asset = await fetchAsset(source);
      const assetHash = hashBytes(asset.bytes);
      const existingFlyer = await client.promotionFlyer.findUnique({
        where: { assetHash },
        select: {
          id: true,
          status: true,
          assetPath: true,
          _count: { select: { deals: true } }
        }
      });

      if (existingFlyer) {
        const deals = await parseAsset({
          assetBytes: asset.bytes,
          assetKind: source.assetKind,
          assetUrl: source.assetUrl
        });
        if (client.promotionFlyer.update) {
          await client.promotionFlyer.update({
            where: { id: existingFlyer.id },
            data: { status: "IMPORTED", errorMessage: null },
            select: { id: true }
          });
        }
        const created = await createPendingDeals(
          client,
          existingFlyer.id,
          retailer.id,
          deals
        );
        if (created === 0) {
          result.duplicatesSkipped += 1;
          continue;
        }
        result.candidatesCreated += created;
        continue;
      }

      const assetPath = await writeAsset(source, asset.bytes, asset.contentType, assetHash);
      let deals: ExtractedPromotionDeal[];
      try {
        deals = await parseAsset({
          assetBytes: asset.bytes,
          assetKind: source.assetKind,
          assetUrl: source.assetUrl
        });
      } catch (error) {
        await client.promotionFlyer.create({
          data: {
            retailerId: retailer.id,
            title: source.title,
            sourceUrl: source.sourceUrl,
            assetUrl: source.assetUrl,
            assetPath,
            assetHash,
            validFrom: source.validFrom ?? null,
            validTo: source.validTo ?? null,
            status: "PARSE_FAILED",
            errorMessage: toErrorMessage(error)
          },
          select: { id: true }
        });
        result.flyersFetched += 1;
        result.parseFailures += 1;
        continue;
      }
      const flyer = await client.promotionFlyer.create({
        data: {
          retailerId: retailer.id,
          title: source.title,
          sourceUrl: source.sourceUrl,
          assetUrl: source.assetUrl,
          assetPath,
          assetHash,
          validFrom: source.validFrom ?? null,
          validTo: source.validTo ?? null,
          status: "IMPORTED"
        },
        select: { id: true }
      });
      result.flyersFetched += 1;

      result.candidatesCreated += await createPendingDeals(client, flyer.id, retailer.id, deals);
    } catch (error) {
      result.parseFailures += 1;
    }
  }

  return result;
}

async function createPendingDeals(
  client: PromotionRefreshClient,
  flyerId: string,
  retailerId: string,
  deals: ExtractedPromotionDeal[]
) {
  if (deals.length === 0) {
    return 0;
  }

  const existingDeals = client.promotionDeal.findMany
    ? await client.promotionDeal.findMany({
        where: { flyerId },
        select: {
          rawTitle: true,
          priceText: true,
          promoText: true,
          pageNumber: true
        }
      })
    : [];
  const existingKeys = new Set(
    existingDeals.map((deal) =>
      getDealKey({
        rawTitle: deal.rawTitle,
        priceText: deal.priceText,
        promoText: deal.promoText,
        pageNumber: deal.pageNumber
      })
    )
  );
  const dealRows: any[] = deals
    .filter((deal) => {
      const key = getDealKey(deal);
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    })
    .map((deal) => ({
    flyerId,
    retailerId,
    category: deal.category,
    rawTitle: deal.rawTitle,
    packText: deal.packText,
    priceText: deal.priceText,
    parsedPrice: deal.parsedPrice,
    promoText: deal.promoText,
    pageNumber: deal.pageNumber,
    sourceX: deal.sourceX,
    sourceY: deal.sourceY,
    sourceWidth: deal.sourceWidth,
    sourceHeight: deal.sourceHeight,
    confidence: deal.confidence,
    reviewStatus: "PENDING"
  }));
  if (dealRows.length === 0) {
    return 0;
  }
  const created = await client.promotionDeal.createMany({ data: dealRows });
  return created.count;
}

function getDealKey(deal: {
  rawTitle: string;
  priceText: string | null;
  promoText: string | null;
  pageNumber: number;
}) {
  return [deal.pageNumber, deal.rawTitle, deal.priceText ?? "", deal.promoText ?? ""].join("|");
}

async function fetchPromotionAsset(source: PromotionSource): Promise<PromotionAsset> {
  const response = await fetch(source.assetUrl, {
    headers: { "user-agent": process.env.SCRAPER_USER_AGENT ?? "SG Grocery Tracker" }
  });
  if (!response.ok) {
    throw new Error(`Promotion asset request failed: ${response.status} ${source.assetUrl}`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")
  };
}

async function writePromotionAsset(
  source: PromotionSource,
  bytes: Buffer,
  contentType: string | null,
  hash: string
) {
  const directory = path.join(process.cwd(), "data", "weekly-ads", source.retailerSlug);
  await mkdir(directory, { recursive: true });
  const assetPath = path.join(directory, `${hash}.${getAssetExtension(source, contentType)}`);
  await writeFile(assetPath, bytes);
  return path.relative(process.cwd(), assetPath);
}

function getAssetExtension(source: PromotionSource, contentType: string | null) {
  if (source.assetKind === "pdf" || contentType?.includes("pdf")) {
    return "pdf";
  }
  if (contentType?.includes("png") || /\.png(?:$|\?)/i.test(source.assetUrl)) {
    return "png";
  }
  return "jpg";
}

function hashBytes(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown promotion parse failure";
}
