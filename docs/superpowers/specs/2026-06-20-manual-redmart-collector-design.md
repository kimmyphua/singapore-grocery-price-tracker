# Manual RedMart Collector and Admin Refresh Design

## Goal

Restore reliable RedMart price and promotion updates without asking ordinary users to install software and without attempting to bypass Lazada's server-side bot protection.

Any signed-in user can request a RedMart refresh for a product they track. The site owner can view and queue RedMart work from an admin page, then run one local command on an authorized Mac to process all pending requests. The collector uses the existing public RedMart product pages in local Chrome and sends verified results back to production.

## Why This Design

RedMart product data is available when its public Lazada page runs in a normal local browser, but Lazada withholds the same product payload from Vercel and GitHub-hosted runners. Retrying from another cloud function does not change that constraint.

The chosen design separates orchestration from collection:

- Vercel stores refresh requests, enforces ownership and admin access, and records results.
- The owner's Mac performs the browser collection only when the owner runs the command.
- Other users can request refreshes but do not install an extension or collector.

Rejected alternatives:

1. **Continue cloud-only scraping.** This remains unreliable because Lazada blocks the execution environment rather than a specific parser.
2. **Require every user to install a browser extension.** This creates a high support and security burden and is unnecessary for the expected catalogue size.
3. **Automate a permanently running Mac daemon.** This adds operational complexity. The first version is intentionally manual and processes all queued work in one run.

## User Experience

### Signed-In Users

On a product page, `Refresh prices` continues to refresh supported cloud retailers immediately. When the product has a RedMart listing, the same action also creates a pending RedMart refresh request.

The page shows the RedMart state explicitly:

- `Waiting for RedMart refresh` when queued.
- `RedMart refresh in progress` after the collector claims it.
- The last verified price and timestamp after completion.
- A concise recorded failure message after a failed collection.

Repeated clicks while a request is pending or in progress return the existing active request rather than creating duplicates.

### Admin

An `/admin/redmart` page is available only to allowlisted admin email addresses. It shows pending, in-progress, completed, and failed requests with product, retailer URL, requester, timestamps, and failure category.

The admin can:

- Queue refreshes for all tracked RedMart listings that do not already have active work.
- Retry a failed request by creating a new pending request.
- See the exact command needed to run the collector.

The admin page does not launch Chrome on the Mac. Its `Queue refreshes` action only creates production jobs. Collection starts when the admin runs `npm run redmart:refresh` locally.

## Authorization and Configuration

Admin access is configured with:

```text
ADMIN_EMAILS=kimberlyphuaweyhan@gmail.com
```

Emails are split on commas, trimmed, and compared case-insensitively with the authenticated user's verified Supabase email. The allowlist protects both the page and admin mutation endpoints.

Collector access is configured with one high-entropy shared secret:

```text
REDMART_COLLECTOR_TOKEN=<random-secret>
```

The same token is stored in Vercel production secrets and the owner's local `.env.local`. Collector endpoints require `Authorization: Bearer <token>`. The token is never sent to browser code, stored in the database, or logged. Server comparison uses a timing-safe equality check.

The local collector also requires:

```text
APP_ORIGIN=https://singapore-grocery-price-tracker.vercel.app
```

## Data Model

Add a `RedMartRefreshJob` model with:

- `id`
- `listingId` relation to `RetailerListing`
- `requestedById` relation to `UserProfile`
- `status`: `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED`
- `activeKey`: the listing ID while active, otherwise `null`
- `attemptCount`
- `leaseExpiresAt`
- `createdAt`, `claimedAt`, `completedAt`, and `updatedAt`
- `failureCategory` and sanitized `failureMessage`

`activeKey` is unique while non-null. This prevents two active jobs for one listing. It is cleared when a job completes or fails, allowing a later refresh.

Jobs retain their terminal state for explainability. Product price history remains in the existing snapshot models; the job table is orchestration history, not a second price store.

## Server Components

### User Queue Endpoint

An authenticated endpoint queues one RedMart listing after checking that:

- The listing belongs to a product tracked by the current user.
- The retailer adapter is RedMart.
- The listing URL passes existing public URL validation.

The operation is idempotent for active work and returns the active job state.

### Admin Queue Endpoint

An admin-only endpoint queues every eligible tracked RedMart listing without an active job. It returns counts for created, already active, and skipped listings.

### Collector Claim Endpoint

A token-protected endpoint atomically claims at most 10 pending jobs. Claiming changes each job to `PROCESSING`, increments `attemptCount`, and sets a 15-minute lease expiry.

A job whose lease expired can be reclaimed. This prevents a crashed collector from leaving it permanently stuck. The response contains only the job ID, listing ID, public URL, retailer identity, and expected item/SKU identifiers needed for validation.

### Collector Result Endpoint

A token-protected endpoint accepts either a successful normalized scrape result or a structured failure.

For success it:

1. Confirms the job is processing and the lease is valid.
2. Confirms the returned RedMart item and SKU identifiers match the claimed listing URL.
3. Passes the normalized result through the existing listing snapshot and price-history service.
4. Marks the job completed and clears `activeKey` in the same database transaction as the snapshot write.

For failure it records the existing scrape failure category and a bounded, sanitized message, marks the job failed, and clears `activeKey`. Raw HTML, cookies, headers, and collector secrets are never accepted or stored.

## Local Collector

Add `npm run redmart:refresh`, implemented as a small TypeScript command that:

1. Loads `APP_ORIGIN` and `REDMART_COLLECTOR_TOKEN` from the local environment.
2. Claims at most 10 production jobs per run.
3. Processes jobs sequentially with at least two seconds between browser collections, using the existing RedMart browser adapter and clear user agent.
4. Submits each normalized result or structured failure.
5. Prints a final summary and exits nonzero only for collector-level failures, not for an individual unavailable product.

The command processes requests from all users. It does not require or use a Lazada login, cart, account pricing, CAPTCHA handling, proxy rotation, or anti-bot bypass.

The normal product-detail response and rendered page are authoritative for product name, pack size, availability, current price, and original price. The RedMart multibuy response is optional enrichment. Products with a normal sale and no multibuy must still complete successfully.

## Parsing Requirements

The RedMart adapter must support both observed promotion shapes:

- A normal sale exposed by rendered/detail data, including current and original price.
- A multibuy promotion exposed under the captured RedMart response's `data.sections`, including promotion text and product membership.

Promotion parsing must match the claimed product by item/SKU identity, not by array position or fuzzy title. If the multibuy response is missing, the primary product result remains valid.

## Error Handling

Failures remain visible and use stable categories such as blocked, timeout, invalid response, identity mismatch, unavailable, and internal error.

- A blocked page records a failed job; it is not silently treated as out of stock.
- An identity mismatch never writes a price snapshot.
- A collector crash is recovered through lease expiry.
- A transient failure can be retried from the admin page.
- Queue and result APIs return structured JSON errors without leaking secrets or raw retailer responses.

## Testing

Add focused tests for:

- Admin email parsing and authorization, including case normalization.
- Collector bearer-token rejection and acceptance.
- User ownership checks and rejection of non-RedMart listings.
- Active-job deduplication and terminal-job requeueing.
- Atomic claiming, batch limits, lease expiry, and reclaiming.
- Result identity validation before snapshot writes.
- A RedMart product with a normal sale and no multibuy.
- A multibuy response using `data.sections`.
- Collector continuation when one job fails.
- Admin page access control and queue summaries.
- Product-page status for pending, processing, completed, and failed jobs.

Before release, run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate`.

## Deployment and Production Acceptance

1. Add the database migration.
2. Configure `ADMIN_EMAILS` and `REDMART_COLLECTOR_TOKEN` in Vercel production.
3. Configure `APP_ORIGIN` and the same collector token in local `.env.local`.
4. Deploy the application from `main`.
5. Queue two production checks: one sale-only RedMart item and one multibuy item.
6. Run `npm run redmart:refresh` on the owner's Mac.
7. Verify both jobs reach `COMPLETED` and production shows the correct price, original price, availability, promotion, and verification timestamp.
8. Verify an ordinary signed-in user can request a refresh but cannot open `/admin/redmart` or call admin and collector endpoints.

The feature is complete only when both RedMart promotion shapes pass this production test.

## Out of Scope

- A Chrome extension for users.
- A continuously running Mac daemon or cron job.
- Lazada login, cart, account-specific pricing, CAPTCHA handling, proxies, or anti-bot bypasses.
- Automatic fuzzy matching or merging of products.
- General-purpose collectors for other retailers.
