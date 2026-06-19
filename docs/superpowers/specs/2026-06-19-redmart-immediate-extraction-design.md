# Immediate RedMart Product Extraction

## Objective

Restore fully automatic RedMart product previews for authenticated users. A valid
public Lazada Singapore product URL must produce the product name, brand, size,
SKU, availability, image, and current price without manual entry.

The deployed multi-user application must become the repository's `main` branch
implementation so Vercel deployments and GitHub scheduled workflows execute the
same code.

## Constraints

- Use only public Lazada Singapore product pages and public page responses.
- Do not add login automation, CAPTCHA handling, proxy rotation, or anti-bot
  bypass logic.
- Preserve low scrape frequency and the configured scraper user agent.
- Treat an actual retailer block as a recorded failed or blocked scrape.
- Keep retailer-specific behavior inside the RedMart adapter.
- Do not silently create a canonical product from incomplete or uncertain data.

## Architecture

### Interactive preview

`POST /api/products/preview` will invoke the RedMart browser adapter on Vercel
instead of unconditionally returning `PARSE_FAILED`. The existing
`@sparticuz/chromium` and `playwright-core` serverless launch path remains the
runtime implementation.

The adapter will have a bounded interactive execution time. It will return a
complete `ProductPreview` only after the existing validation confirms title,
brand, positive price, and pack size. Browser launch, navigation, block-page,
timeout, and parse failures will be logged using sanitized categories without
page contents or user data.

The manual-entry fallback remains available when a retailer genuinely cannot be
read, but it is not the successful acceptance path for RedMart.

### Scheduled recovery

The current multi-user scheduled workflow will be present and enabled on
`main`. It will install Chromium and run the same shared-listing refresh logic
used by the application. Each listing attempt will continue to store its own
`COMPLETED`, `BLOCKED`, or `FAILED` result so one RedMart failure cannot stop
other listings.

Scheduled recovery does not replace interactive extraction. It provides a
second opportunity to refresh an already tracked listing from the GitHub-hosted
runtime.

### Branch and deployment alignment

The reviewed multi-user branch will be integrated into local `main`, including
this design and the RedMart fix. Verification will run on `main`. The resulting
commit will be pushed to `origin/main`, allowing the existing Vercel Git
integration to deploy the same revision used by the default-branch GitHub
schedule.

## Data Flow

1. The user submits a supported `www.lazada.sg/products/...` URL.
2. URL policy validates and canonicalizes the URL.
3. The preview route launches the RedMart serverless browser adapter.
4. The adapter reads rendered public product data and promotion responses.
5. Product normalization validates identity, pack size, and price.
6. The API returns a complete preview for confirmation and saving.
7. Saving creates the tracked product, retailer listing, and initial price
   snapshot through the existing transaction boundary.
8. Later manual or scheduled refreshes update the shared listing and append a
   snapshot only when a valid positive price is obtained.

## Error Handling

- Unsupported URLs return `UNSUPPORTED_URL` without launching a browser.
- Browser launch and navigation failures return a sanitized preview error and
  record the failure category.
- HTTP 403/429, CAPTCHA, access-denied, and explicit bot-protection responses
  are classified as blocked; no bypass is attempted.
- Missing identity or pack-size fields fail validation and do not create an
  automatic canonical product.
- The browser is closed in all success and failure paths.
- The interactive request has a fixed upper bound so it cannot occupy a Vercel
  function indefinitely.

## Testing

Implementation follows test-driven development:

- Change the preview regression test so Vercel requests call the RedMart
  adapter rather than deferring unconditionally.
- Add coverage for bounded timeout and sanitized block/failure handling where
  the existing interfaces permit it.
- Preserve parser tests for query-string price, rendered title, brand, SKU,
  image, availability, and size.
- Verify the scheduled workflow is enabled on `main` and installs Chromium.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate`.

## Production Acceptance

After pushing `main` and confirming the Vercel deployment is ready:

1. Submit the Bulla Creamy Classic Vanilla 2L URL and require an automatic
   preview with price `$12.96`.
2. Submit The Ice Cream & Cookie Co. Mint Chocolate Artisanal Gelato 473 ml URL
   and require an automatic preview with price `$13.95`.
3. Refresh the existing Ben & Jerry's product and verify its RedMart listing
   either produces a visible snapshot or records a specific blocked/failed
   attempt.
4. Confirm Cold Storage and FairPrice behavior remains unchanged.

If production still returns a verified Lazada block page from Vercel, the work
will not add bypass logic. That result establishes that a separately hosted
public-page worker is required for reliable immediate extraction; it must be
designed and deployed as a distinct follow-up rather than hidden behind another
fallback.
