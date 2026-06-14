import { chromium } from "playwright";
import {
  parseRedMartProductPage,
  extractRedMartPrimaryPromotionText,
  extractRedMartPromotionTextFromApiPayload,
  extractRedMartRenderedOriginalPrice,
  extractRedMartRenderedPrice,
  extractRedMartRenderedSize
} from "./redmart-product-page";
import type { ParsedRetailerProduct } from "./product-page-types";

type RedMartExtractionPage = {
  waitForLoadState: (
    state: "networkidle",
    options: { timeout: number }
  ) => Promise<unknown>;
  waitForTimeout: (timeout: number) => Promise<unknown>;
  mouse: {
    wheel: (deltaX: number, deltaY: number) => Promise<unknown>;
  };
  locator: (selector: "body") => {
    innerText: (options: { timeout: number }) => Promise<string>;
  };
};

export async function scrapeRedMartBrowserProductPage(
  url: string
): Promise<ParsedRetailerProduct> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const promotionPayloads: string[] = [];

    page.on("response", async (response) => {
      if (!response.url().includes("getMultibuyProducts")) {
        return;
      }

      try {
        promotionPayloads.push(await response.text());
      } catch {
        // RedMart promotion responses are opportunistic; body text and static fallback still apply.
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await prepareRedMartProductPageForExtraction(page);

    const html = await page.content();
    const bodyText = await page.locator("body").innerText({ timeout: 10000 });
    const product = parseRedMartProductPage(html, url);
    const browserPromotionText = extractRedMartPrimaryPromotionText(bodyText);
    const apiPromotionText = extractRedMartPromotionTextFromApiPayload(promotionPayloads, product);

    return {
      ...product,
      price: extractRedMartRenderedPrice(bodyText) ?? product.price,
      originalPrice: extractRedMartRenderedOriginalPrice(bodyText) ?? product.originalPrice,
      promotionText: browserPromotionText ?? apiPromotionText ?? product.promotionText,
      size: extractRedMartRenderedSize(bodyText) ?? product.size
    };
  } finally {
    await browser.close();
  }
}

export async function prepareRedMartProductPageForExtraction(
  page: RedMartExtractionPage
) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(4500);
  await waitForRedMartPromotionText(page);
}

async function waitForRedMartPromotionText(
  page: Pick<RedMartExtractionPage, "waitForTimeout" | "locator">
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (/Any\s+\d+\s+Save|Spend\s+\$?\d+(?:\.\d+)?\s+\+\s+free gift/i.test(bodyText)) {
      return;
    }

    await page.waitForTimeout(1000);
  }
}
