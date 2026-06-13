export type ProductIdentity = {
  brand: string;
  packCount: number;
  totalSize: number;
  unit: string;
};

export type ProductIdentityField = keyof ProductIdentity;

export type ProductIdentityConflict = {
  field: ProductIdentityField;
  expected: string | number;
  actual: string | number;
};

export type ProductIdentityResult =
  | { compatible: true }
  | {
      compatible: false;
      conflicts: ProductIdentityConflict[];
    };

const NUMERIC_TOLERANCE = 0.005;

export function compareProductIdentity(
  expected: ProductIdentity,
  actual: ProductIdentity
): ProductIdentityResult {
  const conflicts: ProductIdentityConflict[] = [];

  addTextConflict(conflicts, "brand", expected.brand, actual.brand);
  addTextConflict(conflicts, "unit", expected.unit, actual.unit);

  if (expected.packCount !== actual.packCount) {
    conflicts.push({
      field: "packCount",
      expected: expected.packCount,
      actual: actual.packCount
    });
  }

  if (!withinTolerance(expected.totalSize, actual.totalSize)) {
    conflicts.push({
      field: "totalSize",
      expected: expected.totalSize,
      actual: actual.totalSize
    });
  }

  return conflicts.length === 0
    ? { compatible: true }
    : { compatible: false, conflicts };
}

function addTextConflict(
  conflicts: ProductIdentityConflict[],
  field: "brand" | "unit",
  expected: string,
  actual: string
) {
  if (normalizeText(expected) !== normalizeText(actual)) {
    conflicts.push({ field, expected, actual });
  }
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function withinTolerance(expected: number, actual: number): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    return false;
  }

  if (expected === actual) {
    return true;
  }

  const scale = Math.max(Math.abs(expected), Math.abs(actual));
  return scale > 0 && Math.abs(expected - actual) / scale <= NUMERIC_TOLERANCE;
}
