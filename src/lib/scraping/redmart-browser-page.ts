import { chromium } from "playwright";
import {
  parseRedMartProductPage,
  extractRedMartPromotionText,
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
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const html = await page.content();
    const bodyText = await page.locator("body").innerText({ timeout: 10000 });
    const product = parseRedMartProductPage(html, url);
    const browserPromotionText = extractRedMartPromotionText(bodyText);

    return {
      ...product,
      price: extractRedMartRenderedPrice(bodyText) ?? product.price,
      promotionText: browserPromotionText ?? product.promotionText,
      size: extractRedMartRenderedSize(bodyText) ?? product.size
    };
  } finally {
    await browser.close();
  }
}
