# Multi-User Product Tracking And Flyers Design

## Goal

Turn the private, hardcoded grocery tracker into a signed-in application where
each user can track up to 20 products of any type by supplying supported
FairPrice, Cold Storage, and RedMart/Lazada product URLs.

The app must preserve its reliability rules:

- Normal navigation reads stored database rows and never scrapes retailers.
- Retailer data remains separate from user-edited product records.
- Ambiguous products are rejected rather than silently merged.
- Shared retailer URLs are scraped once and reused across users.
- Scrape failures remain visible and do not erase the last known price.

The approved visual direction uses Nunito throughout and the Cozy Companions
palette:

| Token | Hex | Use |
| --- | --- | --- |
| Peach | `#ff9890` | Primary actions and highlighted prices |
| Soft ivory | `#fff9f3` | Page background |
| Sage green | `#bfd8b8` | Success states, table headers, secondary panels |
| Lilac | `#c9b7f6` | Focus states and secondary accents |
| Deep gray | `#444444` | Primary text and dark navigation |

## Delivery Phases

The design is delivered through two independently testable implementation
plans.

### Phase 1: Accounts And Personal Product Tracking

Add authentication, user-owned products, URL-first onboarding, private
dashboard queries, manual refresh, and twice-daily scheduled price refresh.
Migrate the five existing ice-cream products only to the owner's account.

### Phase 2: Shared Flyer Viewer

Remove the unreliable OCR/review/deals workflow from the active application and
replace it with shared current-flyer viewers plus a 12-week history table.

Phase 1 must be usable without Phase 2. Phase 2 reuses the authentication and
scheduled-job foundations established in Phase 1.

## Authentication

Supabase Auth provides passwordless email magic links through the PKCE flow.
Signed-out visitors can access only the login and authentication callback
routes. All dashboard, product, price, flyer, and account routes require a
verified user.

The login form contains:

- Email address
- `Stay logged in` checkbox
- Send magic link action
- Clear sent, expired, invalid, and rate-limited states

Selecting `Stay logged in` changes the application session lifetime, not the
magic-link lifetime:

| Login choice | Application session lifetime |
| --- | --- |
| Not selected | 24 hours |
| Selected | 30 days |

Supabase's own session lifetime is project-wide, so the app enforces the chosen
duration separately.

Before sending a magic link, the server creates a one-time `LoginIntent` with
an opaque nonce, the requested lifetime, and a 15-minute expiry. The callback
URL includes only the opaque nonce. The callback consumes the intent after
Supabase completes the code exchange, so the choice also works when the email
link opens in another browser.

After callback, the app reads the verified Supabase `session_id` claim and
creates an `AppSession` row with the calculated expiry. Every protected server
request:

1. Verifies the current user with Supabase.
2. Reads the verified session ID.
3. Requires a matching, unexpired `AppSession`.
4. Loads or creates the user's application profile.
5. Redirects to login and signs out locally when the app session has expired.

Sign out uses Supabase's local scope so it ends only the current browser
session. Authenticated pages and responses are dynamic and private; they must
not be statically or publicly cached.

## User And Ownership Model

Prisma remains the application's data access layer. Supabase Auth supplies the
identity, while Prisma stores a plain unique Supabase user UUID on
`UserProfile`. The Prisma schema does not create a cross-schema relation to
`auth.users`.

### UserProfile

Stores:

- Supabase user UUID
- Email for display and migration lookup
- Created and updated timestamps

The owner's email is supplied through `LEGACY_OWNER_EMAIL`. The migration
attaches the five existing products to that profile after the matching
Supabase user exists. It must fail clearly rather than assign legacy products
to an arbitrary account.

### TrackedProduct

A private user-owned comparison group containing:

- Owner profile ID
- User-visible slug
- Display name
- Brand
- Family or category
- Optional flavour or variant
- Pack count
- Unit size
- Unit
- Total size
- Optional image URL
- Active state
- Created and updated timestamps

The unique key is `(ownerId, slug)`. Different users may use different names
for the same retailer listing.

### RetailerListing

Remains the shared raw retailer record and stores:

- Retailer
- Canonicalized product URL
- Retailer SKU when available
- Raw extracted title, brand, image, and pack fields
- Latest normalized identity fields
- Created and updated timestamps

`RetailerListing` no longer belongs to one global `CanonicalProduct`.
`PriceSnapshot` continues to belong to the shared listing.

### TrackedProductListing

Joins a private `TrackedProduct` to a shared `RetailerListing`. It enforces:

- One listing can be reused by many users.
- A tracked product can have at most one listing per retailer.
- The same listing cannot be attached twice to one tracked product.

The current `CanonicalProduct` seed rows are migrated into the owner's
`TrackedProduct` rows. The hardcoded product arrays and verified URL arrays are
removed from runtime reads and refreshes after migration.

Deleting a tracked product removes only its private joins and product row.
Shared listings and snapshots remain available to other users. Orphaned shared
records are not automatically deleted in this scope.

## Product Limit

Each user may have at most 20 active tracked products. The limit is enforced
inside the create transaction, not only in the UI. Editing, deleting, and
adding retailer URLs remain available at the limit.

## URL Validation

Because the server fetches user-provided URLs, validation is deny-by-default.

Accepted URLs must:

- Use HTTPS.
- Use the default HTTPS port.
- Match an exact supported product host and path shape.
- Resolve through the retailer adapter selected from the validated host.

Supported sources are:

- FairPrice product pages
- Cold Storage product pages
- Lazada product pages used by RedMart

The fetch layer does not accept credentials, fragments, arbitrary ports, IP
literal hosts, local names, or unsupported subdomains. Redirects are disabled
for validation fetches. If a supported retailer redirects within its own
approved hosts, the adapter may follow that redirect only after validating
each destination.

The browser never receives raw retailer HTML or raw fetch errors.

## Add Product Flow

The product onboarding flow is URL-first:

1. The user chooses `Add product`.
2. The user pastes one supported retailer product URL.
3. The server validates and canonicalizes the URL.
4. The adapter fetches and parses the public product page.
5. The app shows an editable preview containing name, brand, category,
   variant, pack size, image, retailer, current price, and promotion.
6. The user confirms the preview.
7. A transaction creates the private product, upserts the shared listing,
   creates the join, and stores the first positive price snapshot.

The initial URL is sufficient. Users can add the other retailer URLs later.

The save is rejected before creating partial records when:

- The URL is malformed or unsupported.
- The retailer blocks the request.
- Required product identity fields cannot be extracted.
- Pack size cannot be normalized.
- A concrete positive price cannot be extracted.
- The retailer returns no trustworthy product page.
- The user's 20-product limit is reached.

Errors use specific user-facing messages and retain the pasted URL for
correction.

## Add Retailer URL Flow

When adding another retailer to an existing product:

1. Validate and parse the URL with the same onboarding service.
2. Compare normalized brand, pack count, total size, and unit against the
   private tracked product.
3. Accept exact or explicitly compatible identity values.
4. Reject brand, unit, or pack-size mismatches and show the conflicting
   extracted values.
5. Upsert the shared listing and attach it only after validation succeeds.

There is no fuzzy auto-merge. A user may edit their private product fields
before retrying, but cannot override a concrete incompatible retailer result.

Users can edit product display fields, replace a retailer URL through the same
validation flow, remove one retailer URL, or delete the whole tracked product.

## Price Reads

Dashboard, product list, and product detail queries begin from the authenticated
user's `TrackedProduct` rows and traverse through `TrackedProductListing` to
shared listings and snapshots.

The dashboard shows:

- User's tracked product count
- Retailers represented in the user's products
- Products with saved prices
- Most recent successful capture
- Best current value for each tracked product
- Stale or failed update status

The product detail page retains retailer comparison and price history. Product
identity and headings come from the private tracked product; retailer price
facts come from shared listing snapshots.

The last known positive snapshot remains visible when a newer scrape fails.
The UI shows its captured time and the latest attempt status.

## Manual Refresh

Users retain the manual refresh button for:

- All listings attached to their own active products
- One selected tracked product

The authenticated route resolves listing IDs from the current user's joins.
It never accepts an arbitrary listing or another user's product ID without an
ownership check.

A successful refresh updates shared listing metadata and creates shared
snapshots, so other users tracking the same URL benefit from the result.

Refreshes acquire a per-listing Postgres advisory lock. A locked listing is
reported as already refreshing rather than scraped twice. Retailer requests are
processed with the configured user agent and low-frequency delay.

## Scheduled Price Refresh

GitHub Actions runs the scheduled refresh at:

- `12:00 AM Asia/Singapore`
- `12:00 PM Asia/Singapore`

The workflow uses GitHub's timezone-aware schedule where available and also
documents the equivalent UTC hours. It runs only from the default branch.

The scheduled command:

1. Loads distinct shared listings attached to active tracked products.
2. Processes each URL once.
3. Uses the same adapters, locks, persistence, and failure recording as manual
   refresh.
4. Continues after individual failures.
5. Exits non-zero only for job-level failures, not one blocked retailer page.

Required secrets include database connection values, Supabase server
configuration, and the scraper user agent. Playwright Chromium is installed in
the workflow for RedMart.

## Scrape Attempts And Failures

Every attempted listing refresh records:

- Listing ID
- Trigger: onboarding, manual, or scheduled
- Status: started, completed, failed, or blocked
- Started and completed timestamps
- Error category
- Sanitized diagnostic message
- Whether a snapshot was stored

User-facing categories are:

- Unsupported URL
- Retailer blocked the request
- Product details could not be extracted
- Product identity does not match
- Temporary retailer failure

Diagnostics never expose secrets or raw page bodies.

## Flyer Viewer

The current OCR, promotion candidate, review queue, and parsed deals workflow
is removed from active navigation and scheduled execution. Its data is not used
for price comparisons.

The Phase 2 database migration drops `PromotionDeal` and replaces the current
`PromotionFlyer` model with the simpler source/edition records below. Existing
parsed promotion rows are discarded because they are unreliable and have no
role in the new viewer.

The signed-in `/flyers` page contains global editions shared by all users.
Initial sources are:

- Cold Storage Grocery Selections
- FairPrice Price Drop Buy Now - Weekly Savers

### FlyerSource

Stores the stable source key, retailer, public landing URL, source kind, active
state, and last check result.

### FlyerEdition

Stores:

- Source ID
- Title
- Public source URL
- Optional direct PDF URL
- Optional stored asset path
- Optional embeddable publication URL
- Asset kind
- Content hash
- Validity dates when discoverable
- First seen and last checked timestamps

The source adapters discover the current edition. Before storing a new asset,
the refresh compares stable source metadata. When the apparent edition is new,
it downloads the asset and computes SHA-256. An existing hash is treated as
unchanged and no duplicate edition is created.

Cold Storage PDFs are copied to persistent Supabase Storage, rendered in-app
with PDF.js, and exposed through a download action.

FairPrice Publitas editions use the official embeddable viewer when embedding
is permitted. The history action is `Open publication` unless discovery finds
a legitimate direct PDF. The app does not reconstruct or claim a downloadable
PDF from Publitas page images.

If a source blocks framing, the page shows an external-open fallback rather
than a broken viewer.

## Flyer Retention

The flyer refresh runs with the twice-daily scheduled job. No end-user flyer
refresh action is included in this scope.

After refresh, cleanup retains editions first seen within the latest 12 weeks.
Older database rows and owned storage assets are deleted. Cleanup never deletes
an external retailer asset.

The history table shows:

- Retailer and edition title
- Validity dates when available
- First seen date
- Asset type
- View action
- Download action only when a real PDF is available

## Navigation And Visual Design

Signed-in navigation contains:

- Dashboard
- Products
- Flyers
- Account
- Sign out

The current `Deals` and `Review` links are removed. Administrative promotion
review pages are removed or made unreachable as part of Phase 2.

Nunito is used throughout headings, controls, body copy, and tables. The Cozy
Companions palette supplies color tokens, while contrast-sensitive text,
disabled states, errors, and focus rings must meet accessible contrast and
keyboard-navigation requirements.

Mobile pages use stacked cards and actions. Desktop comparison and history
views use compact tables. Loading, empty, stale, blocked, unsupported, and
error states are explicit.

## Security And Authorization

Every Server Action and Route Handler performs its own authentication and
authorization check. UI visibility is not treated as authorization.

Private reads and mutations always include the current profile ID. Public IDs
from forms or URLs are resolved together with owner constraints.

Application pages do not expose Supabase service keys. Server-only operations
use server credentials. Destructive mutations require same-origin requests and
the framework's CSRF protections.

Rate limits apply to:

- Magic-link requests
- URL preview requests
- Product creation
- Manual refresh

## Testing

Phase 1 requires coverage for:

- Magic-link intent creation and one-time consumption
- 24-hour and 30-day app-session expiry
- Local-session sign out
- Protected-route redirects
- Cross-user read, edit, delete, and refresh isolation
- 20-product transactional limit
- Exact URL host and path allowlisting
- Redirect rejection
- FairPrice, Cold Storage, and RedMart parsing
- Preview validation and failure categories
- Product identity mismatch rejection
- Shared listing reuse across users
- Private product deletion without shared snapshot deletion
- Cached price reads through user joins
- Per-listing refresh locking
- Manual refresh ownership
- Scheduled distinct-listing selection and failure continuation
- Legacy product migration to `LEGACY_OWNER_EMAIL`

Phase 2 requires coverage for:

- Cold Storage direct PDF discovery
- FairPrice publication discovery
- Metadata and SHA-256 deduplication
- Unchanged edition skips
- PDF storage and download authorization
- Publitas open/embed fallback behavior
- 12-week retention cleanup
- Removal of parsed promotion data from active price and navigation paths

Before either phase is claimed complete, run:

```bash
npm test
npm run typecheck
npm run lint
npx prisma validate
npm run build
```

Retailer adapters must also be checked against the current public pages before
claiming live URL onboarding works.

## Deployment

The Next.js app remains on Vercel and Postgres remains hosted by Supabase.
Supabase Auth redirect URLs include local development and the production app.
Production magic-link delivery uses configured SMTP suitable for real users.

Deployment configuration includes:

- Supabase public URL and publishable key
- Supabase server secret where required
- `DATABASE_URL` and `DIRECT_URL`
- `LEGACY_OWNER_EMAIL`
- `SCRAPER_USER_AGENT`
- Supabase Storage bucket configuration
- GitHub Actions database and scraper secrets

The migration is deployed before enabling authenticated routes. The owner signs
in once so the profile exists, then the legacy migration is run and verified
before hardcoded runtime fallbacks are removed.
