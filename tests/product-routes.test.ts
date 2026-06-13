import { describe, expect, it } from "vitest";
import {
  productMutationErrorResponse,
  ProductMutationError
} from "@/lib/products/mutations";

describe("product mutation route errors", () => {
  it.each([
    ["PRODUCT_FORBIDDEN", 403],
    ["PRODUCT_LIMIT_REACHED", 409],
    ["DUPLICATE_RETAILER", 409],
    ["INVALID_PRODUCT", 422],
    ["IDENTITY_MISMATCH", 422],
    ["RETAILER_NOT_FOUND", 422]
  ] as const)("maps %s to HTTP %s", async (code, status) => {
    const response = productMutationErrorResponse(
      new ProductMutationError(code)
    );

    expect(response?.status).toBe(status);
    await expect(response?.json()).resolves.toMatchObject({ error: code });
  });

  it("does not convert unknown errors", () => {
    expect(productMutationErrorResponse(new Error("database offline"))).toBeNull();
  });
});
