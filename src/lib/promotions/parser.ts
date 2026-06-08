import {
  extractTextPages as defaultExtractTextPages,
  ocrAssetPages as defaultOcrAssetPages
} from "./ocr";
import type {
  ExtractedPromotionDeal,
  PromotionAssetKind,
  PromotionCategory,
  PromotionParserKind,
  PromotionTextItem,
  PromotionTextPage
} from "./types";

export type ParsePromotionAssetInput = {
  assetBytes: Buffer;
  assetKind: PromotionAssetKind;
  assetUrl: string;
  parserKind: PromotionParserKind;
};

type ParsePromotionAssetDeps = {
  extractTextPages?: (input: ParsePromotionAssetInput) => Promise<PromotionTextPage[]>;
  ocrAssetPages?: (input: ParsePromotionAssetInput) => Promise<PromotionTextPage[]>;
};

const ICE_CREAM_KEYWORDS = [
  "ice cream",
  "magnum",
  "ben & jerry",
  "ben and jerry",
  "tillamook",
  "bulla",
  "haagen",
  "haagen-dazs",
  "paddle pop"
];

const SNACK_KEYWORDS = [
  "snack",
  "chips",
  "cheetos",
  "doritos",
  "kit kat",
  "kitkat",
  "chocolate",
  "biscuit",
  "cookie",
  "cracker",
  "popcorn",
  "crispbread",
  "granola",
  "muesli bar",
  "fruit roll",
  "wafer",
  "pocky",
  "lays",
  "calbee",
  "pringles",
  "cadbury",
  "lindt",
  "ferrero",
  "goldfish"
];

const PRICE_PATTERN = /\$\s?\d+(?:[.,]\d{2})?|\$\s?\d{2,4}\b/g;
const PROMO_PATTERN = /\b(?:any\s+\d+|[2-9]\s+for|buy\s+\d+\s+get\s+\d+|buy\s+1\s+get\s+1|free|save\s+\$?\d+(?:\.\d{2})?)\b/i;

export async function parsePromotionAsset(
  input: ParsePromotionAssetInput,
  deps: ParsePromotionAssetDeps = {}
): Promise<ExtractedPromotionDeal[]> {
  if (isUnverifiedDenseShengSiongFlyer(input.assetUrl)) {
    return [];
  }

  const extractTextPages = deps.extractTextPages ?? defaultExtractTextPages;
  const ocrAssetPages = deps.ocrAssetPages ?? defaultOcrAssetPages;
  const textPages = await extractTextPages(input);
  const pages =
    textPages.some((page) => page.text.trim().length >= 80) || input.assetKind === "image"
      ? textPages
      : await ocrAssetPages(input);

  return extractPromotionDealsFromPages(pages);
}

function isUnverifiedDenseShengSiongFlyer(assetUrl: string) {
  return assetUrl.includes("shengsiongcontent.s3.ap-southeast-1.amazonaws.com");
}

export function extractPromotionDealsFromPages(
  pages: PromotionTextPage[]
): ExtractedPromotionDeal[] {
  const seen = new Set<string>();
  const deals: ExtractedPromotionDeal[] = [];

  for (const page of pages.flatMap(splitPageIntoRegions)) {
    const positionedDeals = extractPositionedPromotionDeals(page);
    if (positionedDeals.length > 0) {
      for (const deal of positionedDeals) {
        const key = `${deal.pageNumber}:${deal.category}:${deal.rawTitle}:${deal.priceText ?? ""}:${deal.promoText ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          deals.push(deal);
        }
      }
      continue;
    }

    const gridDeals = extractImageGridPromotionDeals(page);
    if (gridDeals.length > 0) {
      for (const deal of gridDeals) {
        const key = `${deal.pageNumber}:${deal.category}:${deal.rawTitle}:${deal.priceText ?? ""}:${deal.promoText ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          deals.push(deal);
        }
      }
      continue;
    }

    const normalizedPageText = normalizeExtractedText(page.text);
    const lines = normalizedPageText
      .replace(/\\n/g, "\n")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const category = getCategory(lines[index]);
      if (!category) {
        continue;
      }

      const windowText = buildWindow(lines, index);
      if (!hasPriceOrPromo(windowText)) {
        continue;
      }
      const candidateText = windowText;

      const priceText = getPriceText(candidateText);
      const promoText = getPromoText(candidateText);
      const rawTitle = getRawTitle(candidateText, lines[index]);
      if (!isReadableCandidateTitle(rawTitle)) {
        continue;
      }
      const key = `${page.pageNumber}:${category}:${rawTitle}:${priceText ?? ""}:${promoText ?? ""}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deals.push({
        category,
        rawTitle,
        packText: getPackText(windowText),
        priceText,
        parsedPrice: priceText ? parseDisplayPrice(priceText) : null,
        promoText,
        pageNumber: page.pageNumber,
        confidence:
          priceText && promoText
            ? 0.78
            : priceText || promoText
              ? 0.72
              : 0.35
      });
    }
  }

  return deals.filter(isTrustworthyPromotionDeal);
}

function splitPageIntoRegions(
  page: PromotionTextPage
): PromotionTextPage[] {
  const regionIds = new Set(
    (page.items ?? [])
      .map((item) => item.regionId)
      .filter((regionId): regionId is string => Boolean(regionId))
  );
  if (regionIds.size === 0) {
    return [page];
  }

  return [...regionIds].map((regionId) => ({
    pageNumber: page.pageNumber,
    text: "",
    items: page.items?.filter((item) => item.regionId === regionId)
  }));
}

export function isTrustworthyPromotionDeal(
  deal: ExtractedPromotionDeal
) {
  const readableWords =
    deal.rawTitle.match(/[A-Za-z][A-Za-z'&.-]{1,}/g) ?? [];
  const completePromo = deal.promoText
    ? /(?:\d+\s*FOR|ANY\s+\d+|BUY\s+\d+\s+GET\s+\d+\s+FREE|SAVE\s+(?:\$?\d|UP TO))/i.test(
        deal.promoText
      )
    : false;

  return (
    readableWords.length >= 2 &&
    deal.rawTitle.length >= 8 &&
    deal.rawTitle.length <= 140 &&
    ((deal.parsedPrice !== null && deal.parsedPrice > 0) ||
      completePromo) &&
    deal.confidence >= 0.7
  );
}

function getCategory(text: string): PromotionCategory | null {
  const normalized = text.toLowerCase();
  if (ICE_CREAM_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "ICE_CREAM";
  }
  if (SNACK_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "SNACKS";
  }
  return null;
}

function extractPositionedPromotionDeals(page: PromotionTextPage): ExtractedPromotionDeal[] {
  if (!page.items || page.items.length === 0) {
    return [];
  }

  const items = dedupePositionedItems(page.items);
  const priceGroups = getPositionedPriceGroups(items);
  const deals: ExtractedPromotionDeal[] = [];
  const seenTitles = new Set<string>();
  const seenRawTitles = new Set<string>();

  for (const priceGroup of priceGroups) {
    const cardItems = items.filter(
      (item) =>
        item.x >= priceGroup.x - 95 &&
        item.x <= priceGroup.x + 60 &&
        item.y >= priceGroup.y - 110 &&
        item.y <= priceGroup.y + 42
    );
    const cardText = cardItems.map((item) => item.str).join(" ");
    const category = getCategory(cardText);
    if (!category) {
      continue;
    }

    const titleItems = cardItems.filter((item) => isTitlePositionedItem(item, priceGroup));
    const rawTitle = titleItems
      .sort(sortPositionedItems)
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawTitle) {
      continue;
    }

    const promoText = getPositionedPromoText(cardItems, priceGroup);
    const titleKey = `${page.pageNumber}:${rawTitle}:${priceGroup.priceText}`;
    if (seenTitles.has(titleKey)) {
      continue;
    }
    seenTitles.add(titleKey);
    seenRawTitles.add(rawTitle);

    const box = getSourceBox(cardItems);
    deals.push({
      category,
      rawTitle,
      packText: getPackText(rawTitle),
      priceText: priceGroup.priceText,
      parsedPrice: priceGroup.parsedPrice,
      promoText,
      pageNumber: page.pageNumber,
      sourceX: box.x,
      sourceY: box.y,
      sourceWidth: box.width,
      sourceHeight: box.height,
      confidence: promoText ? 0.9 : 0.84
    });
  }

  for (const promoGroup of getPositionedPromoOnlyGroups(items)) {
    const candidate = getPositionedPromoCardCandidates(items, promoGroup)
      .map((cardItems) => {
        const cardText = cardItems.map((item) => item.str).join(" ");
        const category = getCategory(cardText);
        if (!category) {
          return null;
        }

        const titleItems = cardItems.filter((item) => isTitlePositionedPromoItem(item, promoGroup));
        const rawTitle = titleItems
          .sort(sortPositionedItems)
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!rawTitle) {
          return null;
        }

        return { cardItems, category, rawTitle };
      })
      .filter(
        (
          candidate
        ): candidate is {
          cardItems: PromotionTextItem[];
          category: PromotionCategory;
          rawTitle: string;
        } => candidate !== null
      )
      .find((candidate) => !seenRawTitles.has(candidate.rawTitle));
    if (!candidate) {
      continue;
    }
    const { cardItems, category, rawTitle } = candidate;
    const titleKey = `${page.pageNumber}:${rawTitle}:${promoGroup.promoText}`;
    if (seenTitles.has(titleKey)) {
      continue;
    }
    seenTitles.add(titleKey);
    seenRawTitles.add(rawTitle);

    const box = getSourceBox(cardItems);
    deals.push({
      category,
      rawTitle,
      packText: getPackText(rawTitle),
      priceText: null,
      parsedPrice: null,
      promoText: promoGroup.promoText,
      pageNumber: page.pageNumber,
      sourceX: box.x,
      sourceY: box.y,
      sourceWidth: box.width,
      sourceHeight: box.height,
      confidence: 0.74
    });
  }

  return deals;
}

function extractImageGridPromotionDeals(page: PromotionTextPage): ExtractedPromotionDeal[] {
  if (!page.items || page.items.length === 0) {
    return [];
  }

  const items = dedupePositionedItems(page.items);
  const dealsByCard = new Map<string, ExtractedPromotionDeal>();
  const seenTitles = new Set<string>();

  for (const anchor of [...items].sort(sortPositionedItems)) {
    if (!isImageGridTitleStart(items, anchor)) {
      continue;
    }
    const cardItems = getImageGridCardItems(items, anchor);
    const cardText = cardItems.map((item) => item.str).join(" ");
    const category = getCategory(cardText);
    if (!category) {
      continue;
    }

    const titleItems = getImageGridTitleItems(cardItems, anchor);
    const rawTitle = titleItems
      .sort(sortPositionedItems)
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawTitle || seenTitles.has(rawTitle) || !isReadableCandidateTitle(rawTitle)) {
      continue;
    }

    const priceText = getImageGridPriceText(cardItems, anchor);
    const promoText = getImageGridPromoText(cardItems);
    if (!priceText && !promoText) {
      continue;
    }

    seenTitles.add(rawTitle);
    const box = getSourceBox(cardItems);
    const deal = {
      category,
      rawTitle,
      packText: getPackText(rawTitle),
      priceText,
      parsedPrice: priceText ? parseDisplayPrice(priceText) : null,
      promoText,
      pageNumber: page.pageNumber,
      sourceX: box.x,
      sourceY: box.y,
      sourceWidth: box.width,
      sourceHeight: box.height,
      confidence: priceText && promoText ? 0.72 : 0.62
    };
    const cardKey = `${Math.round(box.x / 20)}:${Math.round(box.y / 20)}`;
    const existing = dealsByCard.get(cardKey);
    if (!existing || rawTitle.length > existing.rawTitle.length) {
      dealsByCard.set(cardKey, deal);
    }
  }

  return [...dealsByCard.values()];
}

function getImageGridCardItems(items: PromotionTextItem[], anchor: PromotionTextItem) {
  return items.filter(
    (item) =>
      item.x >= anchor.x - 12 &&
      item.x <= anchor.x + 220 &&
      item.y >= anchor.y - 110 &&
      item.y <= anchor.y + 150
  );
}

function getImageGridTitleItems(items: PromotionTextItem[], anchor: PromotionTextItem) {
  return items.filter((item) => {
    if (item.y < anchor.y - 20 || item.y > anchor.y + 135) {
      return false;
    }
    if (isImageGridPriceItem(item.str) || isImageGridPromoItem(item.str)) {
      return false;
    }
    if (isImageGridNonTitleLabel(item.str)) {
      return false;
    }
    return /[a-z]/i.test(item.str);
  });
}

function isImageGridTitleStart(items: PromotionTextItem[], anchor: PromotionTextItem) {
  if (
    !/[a-z]/i.test(anchor.str) ||
    isImageGridPromoItem(anchor.str) ||
    isImageGridPriceItem(anchor.str) ||
    isImageGridNonTitleLabel(anchor.str)
  ) {
    return false;
  }

  return !items.some(
    (item) =>
      item !== anchor &&
      /[a-z]/i.test(item.str) &&
      !isImageGridPromoItem(item.str) &&
      !isImageGridPriceItem(item.str) &&
      !isImageGridNonTitleLabel(item.str) &&
      item.x >= anchor.x - 90 &&
      item.x <= anchor.x + 220 &&
      ((Math.abs(item.y - anchor.y) <= 4 && item.x < anchor.x) ||
        (item.y < anchor.y - 4 && item.y >= anchor.y - 70))
  );
}

function isImageGridNonTitleLabel(text: string) {
  return /^(?:per|pack|box|ctn|bot|u\.?p\.?|was)$/i.test(text);
}

function getImageGridPriceText(items: PromotionTextItem[], anchor: PromotionTextItem) {
  const sorted = [...items].sort(sortPositionedItems);

  for (const item of sorted) {
    if (item.y > anchor.y + 90) {
      continue;
    }
    const compact = item.str.replace(/\s+/g, "");
    if (/^(?:U\.?P\.?|WAS)$/i.test(compact)) {
      continue;
    }
    if (item.y >= anchor.y - 5 && !/[=()]/.test(compact)) {
      continue;
    }
    if (isNearLabel(sorted, item, /^(?:U\.?P\.?|WAS)$/i)) {
      continue;
    }
    const compactPrice = getCompactImageGridPrice(compact);
    if (compactPrice) {
      return compactPrice;
    }
  }

  const numericItems = sorted.filter(
    (item) =>
      item.y < anchor.y - 5 &&
      /^\d{1,2}$/.test(item.str) &&
      !isNearLabel(sorted, item, /^(?:U\.?P\.?|WAS|SAVE)$/i)
  );
  for (const dollars of numericItems) {
    const cents = numericItems.find(
      (item) =>
        item !== dollars &&
        /^\d{2}$/.test(item.str) &&
        item.x > dollars.x &&
        item.x <= dollars.x + 70 &&
        Math.abs(item.y - dollars.y) <= 30
    );
    if (cents) {
      return `$${dollars.str}.${cents.str}`;
    }
  }

  return null;
}

function getCompactImageGridPrice(text: string) {
  const centMatch = text.match(/^(\d{2,3})¢$/i);
  if (centMatch) {
    return `$0.${centMatch[1].padStart(2, "0").slice(0, 2)}`;
  }

  if (/^(?:SAVE|WAS|U\.?P\.?)/i.test(text)) {
    return null;
  }
  if (/[a-z]/i.test(text) && !/[$¢=()]/.test(text)) {
    return null;
  }

  const explicit = text.match(/^\$(\d{1,2})(?:[.,](\d{2}))?$/);
  if (explicit) {
    return explicit[2] ? `$${explicit[1]}.${explicit[2]}` : `$${formatCentsPrice(explicit[1])}`;
  }

  const embedded = text.match(/\$?(\d{3,4})/);
  if (!embedded) {
    return null;
  }

  const prefix = text.slice(0, embedded.index ?? 0);
  const digits = embedded[1];
  const priceDigits = prefix.replace(/[$\s]/g, "") ? digits.slice(-3) : digits;
  return `$${formatCentsPrice(priceDigits)}`;
}

function formatCentsPrice(digits: string) {
  if (digits.length <= 2) {
    return `${Number(digits)}.00`;
  }
  return `${Number(digits.slice(0, -2))}.${digits.slice(-2)}`;
}

function getImageGridPromoText(items: PromotionTextItem[]) {
  const sortedItems = [...items].sort(sortPositionedItems);
  const parts = sortedItems
    .filter((item) => isImageGridPromoItem(item.str))
    .map((item) => {
      const label = item.str.replace(/\s+/g, " ").trim();
      if (!/^(?:U\.?P\.?|WAS)$/i.test(label)) {
        return label;
      }
      const value = sortedItems.find(
        (candidate) =>
          candidate !== item &&
          candidate.x > item.x &&
          candidate.x <= item.x + 90 &&
          Math.abs(candidate.y - item.y) <= 22 &&
          /^\$/.test(candidate.str)
      );
      return value ? `${label} ${value.str}` : label;
    });

  return parts.length > 0 ? parts.join("; ") : null;
}

function isImageGridPriceItem(text: string) {
  const compact = text.replace(/\s+/g, "");
  return Boolean(getCompactImageGridPrice(compact)) || /^\d{1,2}$/.test(compact) || /^\d{2,3}¢$/i.test(compact);
}

function isImageGridPromoItem(text: string) {
  return /^(?:SAVE\b|WAS\b|U\.?P\.?|\d+\s*FOR|ANY\s+\d+|BUY\b|FREE\b)/i.test(text);
}

function isNearLabel(
  items: PromotionTextItem[],
  item: PromotionTextItem,
  label: RegExp
) {
  return items.some(
    (candidate) =>
      candidate !== item &&
      label.test(candidate.str) &&
      candidate.x <= item.x &&
      item.x - candidate.x <= 55 &&
      Math.abs(candidate.y - item.y) <= 18
  );
}

type PositionedPriceGroup = {
  priceText: string;
  parsedPrice: number;
  x: number;
  y: number;
  itemKeys: Set<string>;
};

type PositionedPromoOnlyGroup = {
  promoText: string;
  x: number;
  y: number;
  itemKeys: Set<string>;
};

function getPositionedPriceGroups(items: PromotionTextItem[]): PositionedPriceGroup[] {
  const groups: PositionedPriceGroup[] = [];

  for (const dollarItem of items) {
    if (dollarItem.str !== "$") {
      continue;
    }

    const centsItem = findNearestItem(items, (item) => {
      return (
        /^\d{2}$/.test(item.str) &&
        item.x > dollarItem.x + 15 &&
        item.x < dollarItem.x + 90 &&
        Math.abs(item.y - dollarItem.y) <= 5
      );
    });
    if (!centsItem) {
      continue;
    }

    const dollarAmountItem = findNearestItem(items, (item) => {
      return (
        /^\d{1,2}$/.test(item.str) &&
        item.x > dollarItem.x + 4 &&
        item.x < centsItem.x &&
        item.y > dollarItem.y + 3 &&
        item.y < dollarItem.y + 20
      );
    });
    if (!dollarAmountItem) {
      continue;
    }

    const priceText = `$${dollarAmountItem.str}.${centsItem.str}`;
    const parsedPrice = parseDisplayPrice(priceText);
    if (parsedPrice === null) {
      continue;
    }

    groups.push({
      priceText,
      parsedPrice,
      x: dollarItem.x,
      y: dollarItem.y,
      itemKeys: new Set([getPositionedItemKey(dollarItem), getPositionedItemKey(dollarAmountItem), getPositionedItemKey(centsItem)])
    });
  }

  return groups;
}

function dedupePositionedItems(items: PromotionTextItem[]) {
  const seen = new Set<string>();
  const deduped: PromotionTextItem[] = [];
  for (const item of items) {
    const key = getPositionedItemKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  return deduped;
}

function getPositionedPromoOnlyGroups(items: PromotionTextItem[]): PositionedPromoOnlyGroup[] {
  const groups: PositionedPromoOnlyGroup[] = [];

  for (const promoItem of items) {
    if (!/^BUY\s+\d+\s+GET\s+\d+$/i.test(promoItem.str)) {
      continue;
    }

    const freeItem = findNearestItem(
      items,
      (item) =>
        /^FREE$/i.test(item.str) &&
        Math.abs(item.x - promoItem.x) <= 25 &&
        item.y > promoItem.y &&
        item.y <= promoItem.y + 40
    );
    if (!freeItem) {
      continue;
    }

    const wasItem = findNearestItem(
      items,
      (item) =>
        /^WAS\b/i.test(item.str) &&
        Math.abs(item.x - promoItem.x) <= 30 &&
        item.y > freeItem.y &&
        item.y <= freeItem.y + 40
    );
    const promoParts = [`${promoItem.str} ${freeItem.str}`];
    const itemKeys = new Set([getPositionedItemKey(promoItem), getPositionedItemKey(freeItem)]);
    if (wasItem) {
      promoParts.push(wasItem.str);
      itemKeys.add(getPositionedItemKey(wasItem));
    }

    groups.push({
      promoText: promoParts.join("; "),
      x: promoItem.x,
      y: promoItem.y,
      itemKeys
    });
  }

  return groups;
}

function getPositionedPromoCardCandidates(
  items: PromotionTextItem[],
  promoGroup: PositionedPromoOnlyGroup
) {
  return [
    getItemsInPositionedWindow(items, promoGroup, {
      left: 30,
      right: 90,
      top: 100,
      bottom: 65
    }),
    getItemsInPositionedWindow(items, promoGroup, {
      left: 115,
      right: 50,
      top: 100,
      bottom: 65
    })
  ];
}

function getItemsInPositionedWindow(
  items: PromotionTextItem[],
  anchor: { x: number; y: number },
  bounds: { left: number; right: number; top: number; bottom: number }
) {
  return items.filter(
    (item) =>
      item.x >= anchor.x - bounds.left &&
      item.x <= anchor.x + bounds.right &&
      item.y >= anchor.y - bounds.top &&
      item.y <= anchor.y + bounds.bottom
  );
}

function getPositionedItemKey(item: PromotionTextItem) {
  return `${item.str}:${item.x.toFixed(1)}:${item.y.toFixed(1)}`;
}

function findNearestItem(
  items: PromotionTextItem[],
  predicate: (item: PromotionTextItem) => boolean
) {
  const matches = items.filter(predicate);
  matches.sort(sortPositionedItems);
  return matches[0] ?? null;
}

function isTitlePositionedItem(item: PromotionTextItem, priceGroup: PositionedPriceGroup) {
  if (priceGroup.itemKeys.has(getPositionedItemKey(item))) {
    return false;
  }
  if (item.str === "$" || /^\d{1,2}$/.test(item.str)) {
    return false;
  }
  return !/^(?:ANY\s+\d+|\d+\s+FOR|SAVE\b|WAS\b)/i.test(item.str);
}

function isTitlePositionedPromoItem(item: PromotionTextItem, promoGroup: PositionedPromoOnlyGroup) {
  if (promoGroup.itemKeys.has(getPositionedItemKey(item))) {
    return false;
  }
  return !/^(?:ANY\s+\d+|\d+\s+FOR|BUY\b|FREE\b|SAVE\b|WAS\b)/i.test(item.str);
}

function getPositionedPromoText(items: PromotionTextItem[], priceGroup: PositionedPriceGroup) {
  const promoParts = items
    .filter((item) => !priceGroup.itemKeys.has(getPositionedItemKey(item)))
    .filter((item) => /^(?:ANY\s+\d+|\d+\s+FOR|SAVE\b|WAS\b)/i.test(item.str))
    .sort(sortPositionedItems)
    .map((item) => item.str);
  return promoParts.length > 0 ? promoParts.join("; ") : null;
}

function getSourceBox(items: PromotionTextItem[]) {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + (item.width ?? 0)));
  const maxY = Math.max(...items.map((item) => item.y + (item.height ?? 0)));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function sortPositionedItems(a: PromotionTextItem, b: PromotionTextItem) {
  return a.y - b.y || a.x - b.x;
}

function buildWindow(lines: string[], index: number) {
  const segment = [lines[index]];
  for (let next = index + 1; next < Math.min(lines.length, index + 3); next += 1) {
    if (getCategory(lines[next])) {
      break;
    }
    segment.push(lines[next]);
  }
  return segment.join(" ");
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\$\s*\n\s*(\d+)\s*\n\s*(\d{2})/g, (_match, dollars, cents) => `$${dollars}.${cents}`);
}

function hasPriceOrPromo(text: string) {
  PRICE_PATTERN.lastIndex = 0;
  return PRICE_PATTERN.test(text) || PROMO_PATTERN.test(text);
}

function getPriceText(text: string) {
  PRICE_PATTERN.lastIndex = 0;
  const prices = [...text.matchAll(PRICE_PATTERN)].map((match) => match[0].replace(/\s+/g, ""));
  return prices.at(-1) ?? null;
}

function getPromoText(text: string) {
  const match = text.match(PROMO_PATTERN);
  if (!match) {
    return null;
  }

  const start = Math.max(0, match.index ?? 0);
  return text.slice(start, Math.min(text.length, start + 80)).trim();
}

function getRawTitle(windowText: string, fallback: string) {
  const priceIndex = windowText.search(PRICE_PATTERN);
  const title = (priceIndex >= 0 ? windowText.slice(0, priceIndex) : windowText)
    .replace(PROMO_PATTERN, "")
    .replace(/\bWAS\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return title || fallback;
}

function getPackText(text: string) {
  return (
    text.match(/\b\d+\s*x\s*\(?\d+(?:\s*-\s*\d+)?\)?\s*(?:g|kg|ml|l)\b/i)?.[0] ??
    text.match(/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b/i)?.[0] ??
    null
  );
}

function isReadableCandidateTitle(title: string) {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length > 18) {
    return false;
  }

  const letterCount = title.match(/[a-z]/gi)?.length ?? 0;
  if (letterCount < 3) {
    return false;
  }

  const noisyCharacters = title.replace(/[a-z0-9\s&'()\/.,+\-$]/gi, "");
  return noisyCharacters.length / title.length <= 0.06;
}

function parseDisplayPrice(text: string) {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return null;
  }
  if (!cleaned.includes(".") && cleaned.length >= 3) {
    const cents = cleaned.slice(-2);
    const dollars = cleaned.slice(0, -2);
    return Number(`${dollars}.${cents}`);
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
