# Singapore Grocery Price Tracker Plan

## MVP Goal

Build a private Singapore grocery price tracker that reliably compares a small recurring basket across FairPrice, Sheng Siong, Cold Storage, and RedMart.

## Phase 1: Scaffold

- Create Next.js, Prisma, Postgres, Tailwind, test, and CI foundations.
- Seed retailers and canonical products.
- Add pages for dashboard, product list, product detail, and match review.
- Add scraper adapter boundaries without pretending live extraction is verified.

## Phase 2: Verified Scrapers

- Verify each retailer search page or public data endpoint.
- Implement selectors one retailer at a time.
- Store raw listing data and price snapshots.
- Add failure recording in scrape runs.

## Phase 3: Product Matching

- Normalize title, brand, family, flavour, pack count, unit size, total size, and unit price.
- Auto-match only exact high-confidence matches.
- Send likely matches to review before linking.
- Reject low-confidence cross-brand or cross-pack results.

## Phase 4: User Value

- Add price history charts.
- Add basket comparison by retailer.
- Add alert thresholds for watched products.
- Add Telegram, email, or WhatsApp notifications after the price data is reliable.

## Initial Basket

- Magnum ice cream by pack size/flavour
- Bulla ice cream
- Tillamook ice cream
- KitKat chocolate bars by count/weight
- Kinder Bueno by pack size
