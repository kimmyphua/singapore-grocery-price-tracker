export type BestValue = {
  effectivePrice: number;
  effectiveUnitPrice: number;
  dealQuantity: number;
};

export function calculateBestValue(
  shelfPrice: number,
  totalSize: number,
  promotionText: string | null | undefined
): BestValue {
  const candidates = [
    {
      effectivePrice: shelfPrice,
      dealQuantity: 1
    },
    ...parsePromotionCandidates(shelfPrice, promotionText)
  ];

  const best = candidates.sort((left, right) => left.effectivePrice - right.effectivePrice)[0];

  return {
    effectivePrice: roundMoney(best.effectivePrice),
    effectiveUnitPrice: roundUnit(best.effectivePrice / totalSize),
    dealQuantity: best.dealQuantity
  };
}

function parsePromotionCandidates(
  shelfPrice: number,
  promotionText: string | null | undefined
) {
  if (!promotionText) {
    return [];
  }

  const candidates: Array<{ effectivePrice: number; dealQuantity: number }> = [];
  const fixedMultibuy = promotionText.match(
    /any\s+(\d+)\s+(?:@|for|at)\s*\$?(\d+(?:\.\d+)?)/i
  );
  if (fixedMultibuy) {
    const quantity = Number(fixedMultibuy[1]);
    const total = Number(fixedMultibuy[2]);
    candidates.push({
      effectivePrice: total / quantity,
      dealQuantity: quantity
    });
  }

  const percentMultibuy = promotionText.match(/any\s+(\d+)\s+save\s+(\d+(?:\.\d+)?)%/i);
  if (percentMultibuy) {
    const quantity = Number(percentMultibuy[1]);
    const discount = Number(percentMultibuy[2]) / 100;
    candidates.push({
      effectivePrice: shelfPrice * (1 - discount),
      dealQuantity: quantity
    });
  }

  const fixedDiscountMultibuy = promotionText.match(
    /any\s+(\d+)\s+save\s+\$(\d+(?:\.\d+)?)/i
  );
  if (fixedDiscountMultibuy) {
    const quantity = Number(fixedDiscountMultibuy[1]);
    const discount = Number(fixedDiscountMultibuy[2]);
    candidates.push({
      effectivePrice: (shelfPrice * quantity - discount) / quantity,
      dealQuantity: quantity
    });
  }

  return candidates;
}

function roundMoney(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundUnit(value: number): number {
  return Math.round(value * 100000) / 100000;
}
