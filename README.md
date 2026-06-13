# Singapore Grocery Price Tracker

Next.js app for privately tracking Singapore supermarket product URLs and
comparing saved prices across FairPrice, Cold Storage, and RedMart.

## Current State

Users sign in with a Supabase email magic link, add supported product URLs, and
see only their own tracked products. Shared retailer listings are scraped once
and reused when multiple users track the same URL.

The signed-in Flyers area shows the current Cold Storage grocery PDF and
FairPrice Weekly Savers publication, plus a downloadable 12-week history.
Flyer content is informational and never feeds `PriceSnapshot` or product
best-value calculations.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Prisma + Postgres
- Supabase Auth and private Storage
- Vitest
- GitHub Actions scheduled refresh
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

Manual product refresh is available from signed-in product pages. See
`docs/PRICE_REFRESH_BEHAVIOUR.md` for the cached read and refresh contract.

## Scraping Notes

- Scrape only public Singapore grocery pages.
- Do not log in, bypass anti-bot controls, or scrape account/member-only prices.
- Keep scrape frequency low and identify the app with `SCRAPER_USER_AGENT`.
- Record failures and retain the last valid price snapshot.
- Store raw retailer listings separately from user-owned tracked products.
- Dashboard and product pages read cached `PriceSnapshot` rows.
- Foodpanda/Giant bot-protection responses are blocked scrapes, not a reason to
  add bypass logic.
- Flyer editions are shared source documents and never update product prices.

## Deployment

The scheduled workflow runs at 12:00 AM and 12:00 PM Singapore time.

Required application and workflow configuration:

- `DATABASE_URL`
- `DIRECT_URL`
- `SCRAPER_USER_AGENT`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_FLYER_BUCKET`
- `APP_ORIGIN`
- `LEGACY_OWNER_EMAIL` during the one-time legacy migration

Keep the `flyers` Supabase Storage bucket private. Signed-in downloads are
issued through short-lived server-generated URLs.
