import { describe, expect, it } from "vitest";
import { parseProductUrlList } from "@/lib/products/url-list";

describe("parseProductUrlList", () => {
  it("trims, removes blank lines, and deduplicates URLs", () => {
    expect(
      parseProductUrlList(`
        https://example.com/product/1

        https://example.com/product/2
        https://example.com/product/1
      `)
    ).toEqual([
      "https://example.com/product/1",
      "https://example.com/product/2"
    ]);
  });
});
