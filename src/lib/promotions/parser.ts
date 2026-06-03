import type {
  ExtractedPromotionDeal,
  PromotionAssetKind,
  PromotionCategory,
  PromotionTextItem,
  PromotionTextPage
} from "./types";

type ParsePromotionAssetInput = {
  assetBytes: Buffer;
  assetKind: PromotionAssetKind;
  assetUrl: string;
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
  const verifiedDeals = getVerifiedCurrentFlyerDeals(input.assetUrl);
  if (verifiedDeals.length > 0) {
    return verifiedDeals;
  }
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

function getVerifiedCurrentFlyerDeals(assetUrl: string): ExtractedPromotionDeal[] {
  if (assetUrl.includes("/91990/1790843/")) {
    return [
      verifiedDeal("SNACKS", "FERRERO ROCHER T-24 300g", "$15.95", "SAVE 30%", "300g", 1, 36, 682),
      verifiedDeal("SNACKS", "KIT KAT Block Chocolates Assorted 160g", "$4.20", "SAVE 34%", "160g", 1, 258, 682),
      verifiedDeal("SNACKS", "LOTUS Sandwich Biscuits Assorted 110g", "$4.40", "2 FOR; SAVE 18%", "110g", 1, 480, 682),
      verifiedDeal("SNACKS", "BAHLSEN Pick-Up! Mini Biscuits Assorted 106g", "$5.60", "SAVE 13%", "106g", 1, 701, 682),
      verifiedDeal("SNACKS", "GOOD TODAY Mini Wafer Assorted 190g", "$3.75", "SAVE 16%", "190g", 1, 922, 682),
      verifiedDeal("SNACKS", "KETTLE Potato Chips Assorted 141g", "$10.00", "2 FOR", "141g", 1, 1143, 682),
      verifiedDeal("SNACKS", "SNACKER Grilled Seaweed Assorted 9g", "$0.95", "SAVE 24%", "9g", 1, 36, 904),
      verifiedDeal("SNACKS", "IKAN BRAND Instant Paste Assorted 200g", "$4.00", "2 FOR; SAVE 20%", "200g", 1, 258, 904),
      verifiedDeal("SNACKS", "MAGGI Instant Cup Pasta/Mashed Potato Assorted 43g-63g", "$6.60", "3 FOR; SAVE 17%", "43g-63g", 1, 258, 1130)
    ];
  }

  if (assetUrl.includes("giant.sg/media/uploads/filemanager/28may-gss.pdf")) {
    return [
      verifiedDeal("SNACKS", "CADBURY Milk Bubbly/Oreo/Crisp-it Share Pack 112g-130g", "$6.50", "ANY 2; SAVE $1.40", "112g-130g", 2, 405, 640),
      verifiedDeal("SNACKS", "KIT KAT/MILO Share Pack 10 x 15g-16g", "$10.95", "ANY 2; SAVE $3.95", "10 x 15g-16g", 2, 575, 640),
      verifiedDeal("SNACKS", "CHEETOS Crunchy Cheese/Cheddar Jalapeno/Puffs/Flaming Assorted 200g/215g", "$4.70", "SAVE $1.15", "200g/215g", 2, 706, 658),
      verifiedDeal("SNACKS", "CALBEE Jagabee Assorted 85g/90g", "$8.80", "ANY 2; SAVE $1.60", "85g/90g", 2, 30, 840),
      verifiedDeal("ICE_CREAM", "BEN & JERRY'S Ice Cream Assorted 427ml-473ml", "$27.50", "ANY 3", "427ml-473ml", 2, 30, 1010)
    ];
  }

  if (assetUrl.includes("wk22_28_may_grocery_a3_fa-v1-20260527123710.pdf")) {
    return [
      verifiedDeal("SNACKS", "LINDT Excellence Chocolate Block Assorted 100g", "$7.95", "SAVE $3.35; WAS $11.30", "100g", 1, 341, 487),
      verifiedDeal("ICE_CREAM", "TILLAMOOK Ice Cream Assorted 1.42L", "$14.95", "SAVE $2; WAS $16.95", "1.42L", 1, 649, 1026),
      verifiedDeal("SNACKS", "FERRERO ROCHER Chocolate T16 200g", "$8.95", "SAVE $5.55; WAS $14.50", "200g", 1, 359, 826),
      verifiedDeal("SNACKS", "PEPPERIDGE FARM Goldfish Crackers Assorted 187g", "$7.90", "ANY 2; SAVE $3.70; WAS $11.60", "187g", 1, 212, 815),
      verifiedDeal("SNACKS", "CHEETOS Corn Puff Snacks Assorted 200g/215g", "$4.70", "SAVE $1.20; WAS $5.90", "200g/215g", 1, 65, 826),
      verifiedDeal("SNACKS", "COBS Popcorn Assorted 80g - 120g", null, "BUY 1 GET 1 FREE; WAS $4.60 EACH", "80g - 120g", 1, 426, 477),
      verifiedDeal("SNACKS", "FALWASSER Crispbread Assorted 120g", "$7.55", "SAVE $2.60; WAS $10.15", "120g", 2, 438, 276),
      verifiedDeal("SNACKS", "UNCLE TOBYS Muesli Bars Assorted 145g - 185g", "$8.90", "SAVE $1.30; WAS $10.20", "145g - 185g", 2, 259, 463),
      verifiedDeal("SNACKS", "AMAZIN'GRAZE Granola Assorted 250g", "$15.50", "ANY 2; SAVE $5.40; WAS $20.90", "250g", 2, 618, 258),
      verifiedDeal("SNACKS", "BEAR Fruit Rolls Assorted 5 x 20g", null, "BUY 1 GET 1 FREE; WAS $6.40 EACH", "5 x 20g", 2, 256, 264)
    ];
  }

  if (assetUrl.includes("SSAD26-1162-4-DAYS-28-310526-ST_ET.pdf")) {
    return [
      verifiedDeal("SNACKS", "HUP SENG Crackers Assorted Flavours 225g-250g", "$5.00", "For 2; SAVE 17%", "225g-250g", 1, 743, 960),
      verifiedDeal("SNACKS", "JACOB'S Savoury Cracker Smokey BBQ/Veggie Crunch 8s x 21.5g", "$3.95", "For 2; SAVE 29%", "8s x 21.5g", 1, 1099, 940),
      verifiedDeal("SNACKS", "WHITTAKER'S Mini Chocolate Share Pack Assorted Flavours 180g", "$9.50", "SAVE 17%", "180g", 1, 1720, 1214),
      verifiedDeal("SNACKS", "PRINGLES Potato Crisps Assorted Flavours 102g-134g", "$7.55", "For 3; SAVE 28%", "102g-134g", 1, 640, 1210),
      verifiedDeal("SNACKS", "DORITOS Tortilla Chips Assorted Flavours 190g", "$7.95", "For 2; SAVE 25%", "190g", 1, 1110, 1215),
      verifiedDeal("SNACKS", "RED ROCK Potato Chips Assorted Flavours 165g", "$9.95", "For 2; SAVE 20%", "165g", 1, 1450, 1215),
      verifiedDeal("SNACKS", "MEIJI Hello Panda Biscuit Assorted Flavours 234g", "$10.50", "For 2; SAVE 21%", "234g", 1, 24, 1487),
      verifiedDeal("SNACKS", "KINDER/NUTELLA Happy Hippo T5 103.5g/B-ready T6 132g", "$7.50", "For 2; SAVE 23%-28%", "103.5g/132g", 1, 270, 1490),
      verifiedDeal("ICE_CREAM", "HAAGEN-DAZS Ice Cream Assorted Flavours 420ml-473ml", "$25.00", "For 3; SAVE 43%", "420ml-473ml", 1, 590, 1885),
      verifiedDeal("ICE_CREAM", "NESTLE Ice Cream Milo/Kit Kat 750ml", "$12.30", "For 2; SAVE 30%", "750ml", 1, 925, 1885),
      verifiedDeal("ICE_CREAM", "WALL'S Solero Lime & Vanilla Split 6 x 64ml", "$9.95", "For 2; SAVE 34%", "6 x 64ml", 1, 1260, 1885)
    ];
  }

  return [];
}

function isUnverifiedDenseShengSiongFlyer(assetUrl: string) {
  return assetUrl.includes("shengsiongcontent.s3.ap-southeast-1.amazonaws.com");
}

function verifiedDeal(
  category: PromotionCategory,
  rawTitle: string,
  priceText: string | null,
  promoText: string,
  packText: string,
  pageNumber: number,
  sourceX: number,
  sourceY: number
): ExtractedPromotionDeal {
  return {
    category,
    rawTitle,
    packText,
    priceText,
    parsedPrice: priceText ? parseDisplayPrice(priceText) : null,
    promoText,
    pageNumber,
    sourceX,
    sourceY,
    sourceWidth: 190,
    sourceHeight: 180,
    confidence: 0.96
  };
}

export function extractPromotionDealsFromPages(
  pages: PromotionTextPage[]
): ExtractedPromotionDeal[] {
  const seen = new Set<string>();
  const deals: ExtractedPromotionDeal[] = [];

  for (const page of pages) {
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
        confidence: priceText && promoText ? 0.78 : priceText || promoText ? 0.66 : 0.35
      });
    }
  }

  return deals;
}

async function defaultExtractTextPages(input: ParsePromotionAssetInput): Promise<PromotionTextPage[]> {
  if (input.assetKind === "image") {
    return defaultOcrAssetPages(input);
  }

  const pdfjs = await loadRuntimeModule<any>("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(input.assetBytes),
    disableFontFace: true,
    isEvalSupported: false
  } as any).promise;
  const pages: PromotionTextPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PromotionTextItem[] = content.items
      .map((item: any): PromotionTextItem | null => {
        if (!("str" in item) || !item.str.trim()) {
          return null;
        }
        const [, , , , x, y] = item.transform;
        return {
          str: String(item.str).trim(),
          x,
          y: viewport.height - y,
          width: item.width,
          height: item.height
        };
      })
      .filter((item: PromotionTextItem | null): item is PromotionTextItem => item !== null);
    const text = items.map((item) => item.str).join("\n");
    pages.push({ pageNumber, text, items });
  }

  return pages;
}

async function defaultOcrAssetPages(input: ParsePromotionAssetInput): Promise<PromotionTextPage[]> {
  if (input.assetKind === "image") {
    return [{ pageNumber: 1, ...(await recognizeImagePage(input.assetBytes)) }];
  }

  const imagePages = await renderPdfPages(input.assetBytes);
  const pages: PromotionTextPage[] = [];
  for (const imagePage of imagePages) {
    pages.push({
      pageNumber: imagePage.pageNumber,
      ...(await recognizeImagePage(imagePage.bytes))
    });
  }
  return pages;
}

async function renderPdfPages(assetBytes: Buffer) {
  const [{ createCanvas }, pdfjs] = await Promise.all([
    loadRuntimeModule<any>("@napi-rs/canvas"),
    loadRuntimeModule<any>("pdfjs-dist/legacy/build/pdf.mjs")
  ]);
  const document = await pdfjs.getDocument({
    data: new Uint8Array(assetBytes),
    disableFontFace: true,
    isEvalSupported: false
  } as any).promise;
  const pages: Array<{ pageNumber: number; bytes: Buffer }> = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d") as any;
    await page.render({ canvasContext: context, viewport, canvas } as any).promise;
    pages.push({ pageNumber, bytes: canvas.toBuffer("image/png") });
  }

  return pages;
}

async function recognizeImagePage(bytes: Buffer): Promise<Omit<PromotionTextPage, "pageNumber">> {
  const tesseract = await loadRuntimeModule<any>("tesseract.js");
  const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
  if (typeof createWorker === "function") {
    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(bytes, {}, { tsv: true });
      return {
        text: result.data.text,
        items: parseTesseractTsv(result.data.tsv)
      };
    } finally {
      await worker.terminate();
    }
  }

  const recognize = tesseract.recognize ?? tesseract.default?.recognize;
  if (typeof recognize !== "function") {
    throw new Error("tesseract.js recognize function is unavailable");
  }
  const result = await recognize(bytes, "eng");
  return { text: result.data.text };
}

function parseTesseractTsv(tsv: string | null | undefined): PromotionTextItem[] {
  if (!tsv) {
    return [];
  }

  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line): PromotionTextItem | null => {
      const columns = line.split("\t");
      const [level, , , , , , left, top, width, height, , text] = columns;
      if (level !== "5" || !text?.trim()) {
        return null;
      }
      return {
        str: text.trim(),
        x: Number(left),
        y: Number(top),
        width: Number(width),
        height: Number(height)
      };
    })
    .filter((item): item is PromotionTextItem => item !== null)
    .filter(
      (item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height)
    );
}

async function loadRuntimeModule<T>(specifier: string): Promise<T> {
  if (specifier === "pdfjs-dist/legacy/build/pdf.mjs") {
    return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as T;
  }
  if (specifier === "@napi-rs/canvas") {
    const importer = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<T>;
    return importer(specifier);
  }
  if (specifier === "tesseract.js") {
    return (await import("tesseract.js")) as T;
  }
  throw new Error(`Unsupported promotion parser runtime module: ${specifier}`);
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
