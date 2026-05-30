# Singapore Grocery Price Tracker

Next.js full-stack scaffold for comparing Singapore supermarket prices across FairPrice, Sheng Siong, Cold Storage, and RedMart. It also has a review-first weekly flyer import for snack and ice cream promotions.

The initial basket tracks Magnum, Bulla, Tillamook, KitKat, and Kinder Bueno with normalization for flavour, pack size, count, weight, and unit price.

## Current State

This is a deployable scaffold with product-page parsing for the verified URLs in `src/lib/data/verified-product-urls.ts`. App pages read stored price snapshots for fast navigation; retailer scraping happens only through an explicit refresh operation. It is not a broad catalogue crawler yet: each retailer/product URL must be verified before it is trusted for comparison.

Weekly flyer promotions are handled separately from product prices. The app can fetch supermarket weekly ad PDFs/images, extract snack and ice cream candidates with local text/OCR parsing, and queue those candidates for review. Only approved promotion deals appear on `/deals`, and they never change product best-value calculations.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Prisma + Postgres
- Vitest
- GitHub Actions for CI and future scheduled scraping
- Vercel-ready app structure

## Local Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm test
npx prisma validate
npm run scrape
```

Refresh stored price snapshots:

```bash
curl -X POST http://localhost:3000/api/prices/refresh \
  -H 'content-type: application/json' \
  -d '{}'
```

Refresh one product by passing a `productSlug` JSON field. See `docs/PRICE_REFRESH_BEHAVIOUR.md` for the read path and refresh path contract.

Refresh weekly flyer promotions:

```bash
curl -X POST http://localhost:3000/api/promotions/refresh \
  -H 'content-type: application/json' \
  -d '{}'
```

Pass `retailerSlug` to refresh one source: `fairprice`, `giant`, `sheng-siong`, or `cold-storage`. Review imported candidates at `/admin/promotions`; approved deals appear on `/deals`. See `docs/WEEKLY_PROMOTIONS_BEHAVIOUR.md`.

## Scraping Notes

- Scrape only public Singapore grocery pages.
- Do not log in, bypass anti-bot controls, or scrape account/member-only prices.
- Keep scrape frequency low and identify the app with `SCRAPER_USER_AGENT`.
- Review fuzzy matches before linking retailer listings to canonical products.
- Store raw retailer listings separately from canonical products.
- Dashboard and product detail pages must read cached `PriceSnapshot` rows; they must not scrape retailer websites during normal navigation.
- RedMart/Lazada product pages are JavaScript-rendered. The scraper prefers browser-rendered sale prices when available and falls back to verified URL price parameters only when the public page blocks headless extraction.
- Foodpanda/Giant search pages are not trusted for price comparison because search results can silently switch to a different product when the exact item is removed. Do not store Giant prices unless a stable product-level source is verified.
- Products marked unavailable for delivery are still stored and compared when the retailer exposes a price, because online availability can be region-specific.
- Weekly flyer deals are informational promotions. They stay in `PromotionDeal` and must not be copied into `PriceSnapshot` unless a later feature explicitly matches and verifies them against a canonical product.

## Deployment Notes

Recommended future deployment:

- Vercel for the Next.js UI/API.
- Hosted Postgres through Neon, Supabase, or Railway.
- GitHub Actions for scheduled scraping using repository secrets.

Required secrets for scheduled scraping:

- `DATABASE_URL`
- `SCRAPER_USER_AGENT`

The scheduled workflow is intentionally disabled by default and should be enabled only after retailer selectors are verified.
