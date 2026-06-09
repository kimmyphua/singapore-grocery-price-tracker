import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { parsePromotionAsset } from "./parser";
import { discoverPromotionSources } from "./sources";
import type {
  ExtractedPromotionDeal,
  PromotionDiscoveryResult,
  PromotionRetailerSlug,
  PromotionSeriesKey,
  PromotionSource
} from "./types";

type PromotionRefreshOptions = {
  retailerSlug?: PromotionRetailerSlug;
};

type PromotionAsset = {
  bytes: Buffer;
  contentType: string | null;
};

type StoredFlyer = {
  id: string;
  seriesKey: PromotionSeriesKey;
  retailerId: string;
  sourceUrl: string;
  assetUrl: string;
  status: "IMPORTED" | "PARSE_FAILED";
  validFrom: Date | null;
  validTo: Date | null;
};

type PromotionRefreshClient = {
  retailer: {
    findUnique(args: { where: { slug: string }; select?: { id: true } }): Promise<{ id: string } | null>;
  };
  promotionFlyer: {
    findMany(args: {
      where?: { retailer: { slug: PromotionRetailerSlug } };
      select?: Record<string, unknown>;
    }): Promise<StoredFlyer[]>;
    findUnique(args: {
      where: { assetHash: string };
      select?: Record<string, unknown>;
    }): Promise<(StoredFlyer & { assetPath?: string }) | null>;
    create(args: { data: Record<string, unknown>; select?: { id: true } }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      select?: { id: true };
    }): Promise<{ id: string }>;
  };
  promotionDeal: {
    deleteMany(args: {
      where: { flyerId: { in: string[] } };
    }): Promise<{ count: number }>;
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
  now?: Date;
  discoverSources?: (
    options: PromotionRefreshOptions & { now: Date }
  ) => Promise<PromotionDiscoveryResult>;
  fetchAsset?: (source: PromotionSource) => Promise<PromotionAsset>;
  parseAsset?: (input: {
    assetBytes: Buffer;
    assetKind: PromotionSource["assetKind"];
    assetUrl: string;
    parserKind: PromotionSource["parserKind"];
  }) => Promise<ExtractedPromotionDeal[]>;
  writeAsset?: (
    source: PromotionSource,
    bytes: Buffer,
    contentType: string | null,
    hash: string
  ) => Promise<string>;
};

export type PromotionRefreshResult = {
  publicationsDiscovered: number;
  publicationsSkipped: number;
  staleDealsRemoved: number;
  flyersFetched: number;
  candidatesCreated: number;
  parseFailures: number;
  failures: Array<{ seriesKey: PromotionSeriesKey; message: string }>;
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
  const now = deps.now ?? new Date();
  const result: PromotionRefreshResult = {
    publicationsDiscovered: 0,
    publicationsSkipped: 0,
    staleDealsRemoved: 0,
    flyersFetched: 0,
    candidatesCreated: 0,
    parseFailures: 0,
    failures: []
  };

  const discovery = await discoverSourcesForRefresh({ ...options, now });
  result.failures.push(...discovery.failures);

  const storedFlyers = await client.promotionFlyer.findMany({
    ...(options.retailerSlug
      ? { where: { retailer: { slug: options.retailerSlug } } }
      : {}),
    select: {
      id: true,
      seriesKey: true,
      retailerId: true,
      sourceUrl: true,
      assetUrl: true,
      status: true,
      validFrom: true,
      validTo: true
    }
  });
  const storedBySeries = groupStoredFlyers(storedFlyers);
  const latestStoredBySeries = new Map(
    [...storedBySeries.entries()].map(([seriesKey, flyers]) => [
      seriesKey,
      latestStoredFlyer(flyers)
    ])
  );
  const publications = newestPublicationsBySeries(
    groupPublications(discovery.sources)
  );
  result.publicationsDiscovered = publications.length;
  const clearedSeries = new Set<PromotionSeriesKey>();

  for (const [seriesKey, flyers] of storedBySeries) {
    const latestDated = latestDatedStoredFlyer(flyers);
    if (
      latestDated?.validTo &&
      latestDated.validTo.getTime() < now.getTime()
    ) {
      await clearSeriesDeals(client, seriesKey, flyers, clearedSeries, result);
    }
  }

  for (const publication of publications) {
    const first = publication[0];
    if (!first) {
      continue;
    }
    const latest = latestStoredBySeries.get(first.seriesKey);
    if (
      latest?.validFrom &&
      latest.validFrom.getTime() > first.validFrom.getTime()
    ) {
      result.publicationsSkipped += 1;
      continue;
    }
    if (isCompleteImportedPublication(publication, storedBySeries)) {
      result.publicationsSkipped += 1;
      continue;
    }

    if (
      !latest?.validFrom ||
      first.validFrom.getTime() > latest.validFrom.getTime()
    ) {
      await clearSeriesDeals(
        client,
        first.seriesKey,
        storedBySeries.get(first.seriesKey) ?? [],
        clearedSeries,
        result
      );
    }

    for (const source of publication) {
      await importPromotionPage(
        source,
        client,
        fetchAsset,
        parseAsset,
        writeAsset,
        result
      );
    }
  }

  return result;
}

async function importPromotionPage(
  source: PromotionSource,
  client: PromotionRefreshClient,
  fetchAsset: NonNullable<PromotionRefreshDeps["fetchAsset"]>,
  parseAsset: NonNullable<PromotionRefreshDeps["parseAsset"]>,
  writeAsset: NonNullable<PromotionRefreshDeps["writeAsset"]>,
  result: PromotionRefreshResult
) {
  let retailer: { id: string } | null;
  try {
    retailer = await client.retailer.findUnique({
      where: { slug: source.retailerSlug },
      select: { id: true }
    });
  } catch (error) {
    recordFailure(result, source.seriesKey, toErrorMessage(error));
    return;
  }
  if (!retailer) {
    recordFailure(
      result,
      source.seriesKey,
      `Retailer not found: ${source.retailerSlug}`
    );
    return;
  }

  let asset: PromotionAsset;
  try {
    asset = await fetchAsset(source);
  } catch (error) {
    recordFailure(result, source.seriesKey, toErrorMessage(error));
    return;
  }

  const rawAssetHash = hashBytes(asset.bytes);
  const assetHash = hashSourceAsset(source, rawAssetHash);
  let existingFlyer: (StoredFlyer & { assetPath?: string }) | null;
  try {
    existingFlyer = await client.promotionFlyer.findUnique({
      where: { assetHash },
      select: {
        id: true,
        seriesKey: true,
        retailerId: true,
        sourceUrl: true,
        assetUrl: true,
        validFrom: true,
        validTo: true,
        status: true,
        assetPath: true
      }
    });
  } catch (error) {
    recordFailure(result, source.seriesKey, toErrorMessage(error));
    return;
  }

  if (existingFlyer) {
    try {
      const removed = await client.promotionDeal.deleteMany({
        where: { flyerId: { in: [existingFlyer.id] } }
      });
      result.staleDealsRemoved += removed.count;
    } catch (error) {
      recordFailure(result, source.seriesKey, toErrorMessage(error));
      return;
    }

    let deals: ExtractedPromotionDeal[];
    try {
      deals = await parseDealsForSource(source, asset.bytes, parseAsset);
    } catch (error) {
      recordParserFailure(result, source.seriesKey, toErrorMessage(error));
      try {
        await client.promotionFlyer.update({
          where: { id: existingFlyer.id },
          data: {
            retailerId: retailer.id,
            seriesKey: source.seriesKey,
            title: source.title,
            sourceUrl: source.sourceUrl,
            assetUrl: source.assetUrl,
            assetPath: existingFlyer.assetPath ?? source.assetUrl,
            validFrom: source.validFrom,
            validTo: source.validTo,
            status: "PARSE_FAILED",
            errorMessage: toErrorMessage(error)
          },
          select: { id: true }
        });
      } catch (diagnosticError) {
        recordFailure(
          result,
          source.seriesKey,
          toErrorMessage(diagnosticError)
        );
      }
      return;
    }

    try {
      await client.promotionFlyer.update({
        where: { id: existingFlyer.id },
        data: {
          retailerId: retailer.id,
          seriesKey: source.seriesKey,
          title: source.title,
          sourceUrl: source.sourceUrl,
          assetUrl: source.assetUrl,
          assetPath: existingFlyer.assetPath ?? source.assetUrl,
          validFrom: source.validFrom,
          validTo: source.validTo,
          status: "IMPORTED",
          errorMessage: null
        },
        select: { id: true }
      });
    } catch (error) {
      recordFailure(result, source.seriesKey, toErrorMessage(error));
      return;
    }
    try {
      result.candidatesCreated += await createPendingDeals(
        client,
        existingFlyer.id,
        retailer.id,
        deals
      );
    } catch (error) {
      recordFailure(result, source.seriesKey, toErrorMessage(error));
    }
    return;
  }

  let assetPath: string;
  try {
    assetPath = await writeAsset(
      source,
      asset.bytes,
      asset.contentType,
      rawAssetHash
    );
  } catch (error) {
    recordFailure(result, source.seriesKey, toErrorMessage(error));
    assetPath = source.assetUrl;
  }
  let deals: ExtractedPromotionDeal[];
  try {
    deals = await parseDealsForSource(source, asset.bytes, parseAsset);
  } catch (error) {
    recordParserFailure(result, source.seriesKey, toErrorMessage(error));
    try {
      await client.promotionFlyer.create({
        data: {
          retailerId: retailer.id,
          seriesKey: source.seriesKey,
          title: source.title,
          sourceUrl: source.sourceUrl,
          assetUrl: source.assetUrl,
          assetPath,
          assetHash,
          validFrom: source.validFrom,
          validTo: source.validTo,
          status: "PARSE_FAILED",
          errorMessage: toErrorMessage(error)
        },
        select: { id: true }
      });
      result.flyersFetched += 1;
    } catch (diagnosticError) {
      recordFailure(result, source.seriesKey, toErrorMessage(diagnosticError));
    }
    return;
  }

  let flyer: { id: string };
  try {
    flyer = await client.promotionFlyer.create({
      data: {
        retailerId: retailer.id,
        seriesKey: source.seriesKey,
        title: source.title,
        sourceUrl: source.sourceUrl,
        assetUrl: source.assetUrl,
        assetPath,
        assetHash,
        validFrom: source.validFrom,
        validTo: source.validTo,
        status: "IMPORTED"
      },
      select: { id: true }
    });
    result.flyersFetched += 1;
  } catch (error) {
    recordFailure(result, source.seriesKey, toErrorMessage(error));
    return;
  }
  try {
    result.candidatesCreated += await createPendingDeals(
      client,
      flyer.id,
      retailer.id,
      deals
    );
  } catch (error) {
    recordFailure(result, source.seriesKey, toErrorMessage(error));
  }
}

async function parseDealsForSource(
  source: PromotionSource,
  assetBytes: Buffer,
  parseAsset: NonNullable<PromotionRefreshDeps["parseAsset"]>
) {
  return (await parseAsset({
    assetBytes,
    assetKind: source.assetKind,
    assetUrl: source.assetUrl,
    parserKind: source.parserKind
  })).map((deal) => ({
    ...deal,
    pageNumber: source.pageNumber
  }));
}

function groupPublications(sources: PromotionSource[]) {
  const groups = new Map<string, PromotionSource[]>();
  for (const source of sources) {
    const pages = groups.get(source.publicationKey) ?? [];
    pages.push(source);
    groups.set(source.publicationKey, pages);
  }
  return [...groups.values()].map((pages) =>
    pages.sort((a, b) => a.pageNumber - b.pageNumber)
  );
}

function newestPublicationsBySeries(publications: PromotionSource[][]) {
  const newest = new Map<PromotionSeriesKey, PromotionSource[]>();
  for (const publication of publications) {
    const first = publication[0];
    if (!first) {
      continue;
    }
    const current = newest.get(first.seriesKey);
    const currentFirst = current?.[0];
    if (
      !currentFirst ||
      first.validFrom.getTime() > currentFirst.validFrom.getTime() ||
      (first.validFrom.getTime() === currentFirst.validFrom.getTime() &&
        first.publicationKey > currentFirst.publicationKey)
    ) {
      newest.set(first.seriesKey, publication);
    }
  }
  return [...newest.values()];
}

function isCompleteImportedPublication(
  publication: PromotionSource[],
  storedBySeries: Map<PromotionSeriesKey, StoredFlyer[]>
) {
  const first = publication[0];
  if (!first) {
    return false;
  }
  const stored = storedBySeries.get(first.seriesKey) ?? [];
  return publication.every((source) =>
    stored.some(
      (flyer) =>
        flyer.status === "IMPORTED" &&
        flyer.validFrom?.getTime() === source.validFrom.getTime() &&
        flyer.validTo?.getTime() === source.validTo.getTime() &&
        flyer.sourceUrl === source.sourceUrl &&
        flyer.assetUrl === source.assetUrl
    )
  );
}

function groupStoredFlyers(storedFlyers: StoredFlyer[]) {
  const groups = new Map<PromotionSeriesKey, StoredFlyer[]>();
  for (const flyer of storedFlyers) {
    const flyers = groups.get(flyer.seriesKey) ?? [];
    flyers.push(flyer);
    groups.set(flyer.seriesKey, flyers);
  }
  return groups;
}

function latestStoredFlyer(flyers: StoredFlyer[]) {
  return flyers.reduce((latest, flyer) => {
    const latestTime = latest.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
    const flyerTime = flyer.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
    return flyerTime > latestTime ? flyer : latest;
  });
}

function latestDatedStoredFlyer(flyers: StoredFlyer[]) {
  const dated = flyers.filter(
    (flyer) => flyer.validFrom !== null && flyer.validTo !== null
  );
  return dated.length > 0 ? latestStoredFlyer(dated) : null;
}

async function clearSeriesDeals(
  client: PromotionRefreshClient,
  seriesKey: PromotionSeriesKey,
  flyers: StoredFlyer[],
  clearedSeries: Set<PromotionSeriesKey>,
  result: PromotionRefreshResult
) {
  if (clearedSeries.has(seriesKey) || flyers.length === 0) {
    return;
  }
  const removed = await client.promotionDeal.deleteMany({
    where: { flyerId: { in: flyers.map((flyer) => flyer.id) } }
  });
  result.staleDealsRemoved += removed.count;
  clearedSeries.add(seriesKey);
}

function recordParserFailure(
  result: PromotionRefreshResult,
  seriesKey: PromotionSeriesKey,
  message: string
) {
  result.parseFailures += 1;
  result.failures.push({ seriesKey, message });
}

function recordFailure(
  result: PromotionRefreshResult,
  seriesKey: PromotionSeriesKey,
  message: string
) {
  result.failures.push({ seriesKey, message });
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

function hashSourceAsset(source: PromotionSource, rawAssetHash: string) {
  return createHash("sha256")
    .update(
      [
        rawAssetHash,
        source.seriesKey,
        source.publicationKey,
        source.pageNumber,
        source.sourceUrl
      ].join("|")
    )
    .digest("hex");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown promotion parse failure";
}
