import { normalizeProductTitle } from "@/lib/products/normalize";
import { fetchRetailerPage } from "./http";
import { parseProductPage } from "./parse-product-page";

async function main() {
  const url = process.argv[2];

  if (!url) {
    throw new Error("Usage: npm run scrape:url -- <product-url>");
  }

  const html = await fetchRetailerPage(url);
  const product = parseProductPage(html, url);
  const normalized = normalizeProductTitle(product.titleRaw);

  console.log(JSON.stringify({ product, normalized }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
