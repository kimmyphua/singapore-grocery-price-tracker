# Price Refresh Behaviour

## Read Path

Normal app navigation must not scrape retailer websites.

The dashboard and product detail pages read from stored `PriceSnapshot` rows through `getCachedLatestPrices()`. This keeps page loads bounded by the local database instead of external supermarket response times.

Product detail pages pass the current product slug into the cached reader, so they only query snapshots for the product being viewed.

## Refresh Path

Retailer scraping is an explicit refresh operation:

```bash
curl -X POST http://localhost:3000/api/prices/refresh \
  -H 'content-type: application/json' \
  -d '{}'
```

Refresh one product:

```bash
curl -X POST http://localhost:3000/api/prices/refresh \
  -H 'content-type: application/json' \
  -d '{"productSlug":"magnum-mini-almond-6x55ml"}'
```

The refresh path calls the verified retailer URLs, calculates current best value, upserts a matched `RetailerListing`, and creates a new `PriceSnapshot`. Rows without a concrete price are skipped because `PriceSnapshot.price` is required by the schema.

Foodpanda/Giant search URLs are intentionally excluded from refreshes. Foodpanda can remove the exact grocery item while still returning similar search results, and the app cannot treat a search-result text match as a verified product-level price.

## Expected UI States

- With stored snapshots, pages show the latest cached comparison immediately.
- Without stored snapshots, products show pending/no snapshot states quickly.
- If a retailer says an item is unavailable but still exposes a price, the snapshot is stored and remains eligible for best-value comparison.
- Refreshes may be slow because they call remote retailer sites and may launch Playwright for RedMart. This cost is intentionally kept out of normal navigation.

## Verification

The cache boundary is covered by `tests/cached-prices.test.ts`.

The refresh persistence boundary is covered by `tests/refresh-prices.test.ts`.
