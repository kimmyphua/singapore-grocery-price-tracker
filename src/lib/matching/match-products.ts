export type MatchableProduct = {
  brand: string;
  family: string;
  flavour: string | null;
  packCount: number;
  totalSize: number;
  unit: string;
};

export type ProductMatchResult = {
  status: "AUTO_MATCH" | "REVIEW" | "NO_MATCH";
  confidence: number;
  reasons: string[];
};

export function classifyProductMatch(
  canonical: MatchableProduct,
  candidate: MatchableProduct
): ProductMatchResult {
  const checks = [
    ["brand", sameText(canonical.brand, candidate.brand), 0.3],
    ["family", sameText(canonical.family, candidate.family), 0.2],
    ["flavour", sameText(canonical.flavour, candidate.flavour), 0.2],
    [
      "pack",
      canonical.packCount === candidate.packCount && canonical.unit === candidate.unit,
      0.15
    ],
    ["size", Math.abs(canonical.totalSize - candidate.totalSize) < 0.01, 0.15]
  ] as const;

  const confidence = Number(
    checks
      .filter(([, matched]) => matched)
      .reduce((total, [, , weight]) => total + weight, 0)
      .toFixed(2)
  );
  const reasons = checks
    .filter(([, matched]) => matched)
    .map(([reason]) => reason);

  if (confidence === 1) {
    return { status: "AUTO_MATCH", confidence, reasons };
  }

  if (confidence >= 0.75) {
    return { status: "REVIEW", confidence, reasons };
  }

  return { status: "NO_MATCH", confidence, reasons };
}

function sameText(left: string | null, right: string | null): boolean {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}
