import { chromium } from "playwright";
import {
  parseRedMartProductPage,
  extractRedMartPromotionText,
  extractRedMartPromotionTextFromApiPayload,
  extractRedMartRenderedPrice,
  extractRedMartRenderedSize
} from "./redmart-product-page";
import type { ParsedRetailerProduct } from "./product-page-types";

export async function scrapeRedMartBrowserProductPage(
  url: string
): Promise<ParsedRetailerProduct> {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
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

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const html = await page.content();
    const bodyText = await page.locator("body").innerText({ timeout: 10000 });
    const product = parseRedMartProductPage(html, url);
    const browserPromotionText = extractRedMartPromotionText(bodyText);
    const apiPromotionText = extractRedMartPromotionTextFromApiPayload(promotionPayloads, product);

    return {
      ...product,
      price: extractRedMartRenderedPrice(bodyText) ?? product.price,
      promotionText: browserPromotionText ?? apiPromotionText ?? product.promotionText,
      size: extractRedMartRenderedSize(bodyText) ?? product.size
    };
  } finally {
    await browser.close();
  }
}
