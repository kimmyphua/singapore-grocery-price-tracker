export type ProductUnit = "g" | "kg" | "ml" | "l" | "pcs";

export type ParsedPackSize = {
  packCount: number;
  unitSize: number;
  unit: ProductUnit;
  totalSize: number;
};

export type NormalizedProduct = ParsedPackSize & {
  brand: string;
  family: string;
  flavour: string | null;
  normalizedTitle: string;
};

const BRAND_FAMILIES = [
  { brand: "Kinder Bueno", family: "Chocolate" },
  { brand: "KitKat", family: "Chocolate", aliases: ["KitKat", "Kit Kat"] },
  { brand: "Magnum", family: "Ice cream" },
  { brand: "Bulla", family: "Ice cream" },
  { brand: "Tillamook", family: "Ice cream" },
  { brand: "Lakerol", family: "Pastilles" }
];

const KNOWN_FLAVOURS = [
  "Almond",
  "Vanilla",
  "Chocolate",
  "Milk Chocolate",
  "Original",
  "Mint",
  "Strawberry",
  "Caramel",
  "Cookies",
  "Classic"
];

export function parsePackSize(title: string): ParsedPackSize {
  const normalized = title.toLowerCase();
  const multiPack = normalized.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);

  if (multiPack) {
    const packCount = Number(multiPack[1]);
    const unitSize = Number(multiPack[2]);
    const unit = multiPack[3].toLowerCase() as ProductUnit;

    return {
      packCount,
      unitSize,
      unit,
      totalSize: roundSize(packCount * unitSize)
    };
  }

  const singleSize = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  if (singleSize) {
    const unitSize = Number(singleSize[1]);
    const unit = singleSize[2].toLowerCase() as ProductUnit;

    return {
      packCount: 1,
      unitSize,
      unit,
      totalSize: unitSize
    };
  }

  const pieces = normalized.match(/(?:pack of|x)\s*(\d+)|(\d+)\s*(?:pcs|pieces|s)\b/i);
  const packCount = pieces ? Number(pieces[1] ?? pieces[2]) : 1;

  return {
    packCount,
    unitSize: 1,
    unit: "pcs",
    totalSize: packCount
  };
}

export function calculateUnitPrice(price: number, totalSize: number): number {
  if (totalSize <= 0) {
    throw new Error("totalSize must be greater than zero");
  }

  return price / totalSize;
}

export function normalizeProductTitle(title: string): NormalizedProduct {
  const brandFamily = BRAND_FAMILIES.find(({ brand }) =>
    getBrandAliases(brand).some((alias) =>
      title.toLowerCase().includes(alias.toLowerCase())
    )
  );
  const parsedPack = parsePackSize(title);

  return {
    brand: brandFamily?.brand ?? "Unknown",
    family: brandFamily?.family ?? "Unknown",
    flavour: extractFlavour(title),
    normalizedTitle: title.trim().replace(/\s+/g, " "),
    ...parsedPack
  };
}

function getBrandAliases(brand: string): string[] {
  const record = BRAND_FAMILIES.find((item) => item.brand === brand) as
    | { brand: string; aliases?: string[] }
    | undefined;

  return record?.aliases ?? [brand];
}

function extractFlavour(title: string): string | null {
  const lowerTitle = title.toLowerCase();
  const match = KNOWN_FLAVOURS.find((flavour) =>
    lowerTitle.includes(flavour.toLowerCase())
  );

  return match ?? null;
}

function roundSize(value: number): number {
  return Math.round(value * 1000) / 1000;
}
