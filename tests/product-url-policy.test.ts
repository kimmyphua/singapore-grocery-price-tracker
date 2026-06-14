import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSupportedProductUrl,
  UnsupportedProductUrlError
} from "@/lib/products/url-policy";
import { fetchRetailerPage } from "@/lib/scraping/http";

describe("parseSupportedProductUrl", () => {
  it.each([
    [
      "https://www.fairprice.com.sg/product/13142563",
      "fairprice",
      "https://www.fairprice.com.sg/product/13142563"
    ],
    [
      "https://coldstorage.com.sg/product/magnum-mini-almond-6s?utm_source=email",
      "cold-storage",
      "https://coldstorage.com.sg/product/magnum-mini-almond-6s"
    ],
    [
      "https://www.lazada.sg/products/pdp-i301118872-s527230478.html?price=12.96&stock=1",
      "redmart",
      "https://www.lazada.sg/products/pdp-i301118872-s527230478.html"
    ],
    [
      "https://shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g?utm_source=email",
      "sheng-siong",
      "https://shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g"
    ]
  ] as const)(
    "accepts and canonicalizes %s",
    (input, retailerSlug, canonicalUrl) => {
      expect(parseSupportedProductUrl(input)).toEqual({
        retailerSlug,
        canonicalUrl
      });
    }
  );

  it.each([
    "http://www.fairprice.com.sg/product/13142563",
    "https://user:password@www.fairprice.com.sg/product/13142563",
    "https://www.fairprice.com.sg:444/product/13142563",
    "https://127.0.0.1/product/13142563",
    "https://fairprice.com.sg/product/13142563",
    "https://shop.fairprice.com.sg/product/13142563",
    "https://www.fairprice.com.sg/search?query=milk",
    "https://www.fairprice.com.sg/product/",
    "https://www.fairprice.com.sg/product/13142563#reviews",
    "https://coldstorage.com.sg/search?q=milk",
    "https://coldstorage.com.sg/product",
    "https://www.lazada.sg/catalog/?q=milk",
    "https://www.lazada.sg/products/not-a-redmart-product.html",
    "https://redmart.lazada.sg/catalog/?q=milk",
    "https://shengsiong.com.sg/search?q=fish",
    "https://www.shengsiong.com.sg/product/tasty-bites-handmade-fried-fish-bean-curd-240-g"
  ])("rejects unsupported URL %s", (input) => {
    expect(() => parseSupportedProductUrl(input)).toThrow(
      UnsupportedProductUrlError
    );
    expect(() => parseSupportedProductUrl(input)).toThrow("UNSUPPORTED_URL");
  });
});

describe("fetchRetailerPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("follows a validated same-retailer redirect", async () => {
    vi.stubEnv("SCRAPER_MIN_DELAY_MS", "0");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/product/updated-product-13142563" }
        })
      )
      .mockResolvedValueOnce(new Response("<html>product</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRetailerPage(
        "https://www.fairprice.com.sg/product/original-product-13142563"
      )
    ).resolves.toBe("<html>product</html>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://www.fairprice.com.sg/product/original-product-13142563",
      expect.objectContaining({ redirect: "manual" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://www.fairprice.com.sg/product/updated-product-13142563",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("rejects cross-retailer redirects", async () => {
    vi.stubEnv("SCRAPER_MIN_DELAY_MS", "0");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://coldstorage.com.sg/product/magnum-mini-almond-6s"
          }
        })
      )
    );

    await expect(
      fetchRetailerPage("https://www.fairprice.com.sg/product/13142563")
    ).rejects.toThrow("UNSUPPORTED_REDIRECT");
  });

  it("rejects more than two redirects", async () => {
    vi.stubEnv("SCRAPER_MIN_DELAY_MS", "0");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "/product/13142563" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRetailerPage("https://www.fairprice.com.sg/product/13142563")
    ).rejects.toThrow("TOO_MANY_REDIRECTS");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
