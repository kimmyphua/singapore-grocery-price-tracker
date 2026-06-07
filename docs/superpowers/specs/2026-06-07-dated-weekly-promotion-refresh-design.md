# Dated Weekly Promotion Refresh Design

## Goal

Keep the promotion review queue and public Deals page limited to current
retailer flyers. A refresh must discover each supported promotion series,
compare its validity dates with stored data, remove stale deals, and import
only trustworthy snack and ice cream candidates.

The refresh implementation must derive its results from public retailer
sources. Development and verification must not directly insert or delete
production database rows.

## Promotion Series

Each independently published feed has a stable series key:

| Series key | Retailer | Public source |
| --- | --- | --- |
| `fairprice-weekly-savers` | FairPrice | Price Drop Buy Now - Weekly Savers |
| `fairprice-must-buy` | FairPrice | Price Drop Buy Now - Must Buy |
| `cold-storage-grocery-selections` | Cold Storage | Grocery Selections |
| `giant-super-savings` | Giant | Super Savings |
| `sheng-siong-newspaper-advertisement` | Sheng Siong | Newspaper Advertisement |

FairPrice Weekly Savers and Must Buy are separate series. A new publication in
one series must not remove deals belonging to the other series.

## Source Discovery

Retailer adapters return a promotion publication rather than unrelated page
assets. Each publication contains:

- Stable series key
- Retailer slug
- Publication title and source URL
- `validFrom` and `validTo`
- One or more ordered page assets
- Asset kind and page number

FairPrice discovery reads the public Publitas `data.json` and `spreads.json`
resources for both series. The publication title provides the date range, and
the spreads response provides every page image. This avoids relying on one
image URL scraped from rendered HTML.

Cold Storage discovery reads the current Grocery Selections page title and
page content for its validity range and flyer asset. The adapter must support
the current numbered route, such as `Grocery-Selections-1`, without hardcoding
that suffix as a permanent identifier.

Giant and Sheng Siong use their public flyer pages. If Sheng Siong exposes no
reliable current flyer, discovery returns no publication and refresh skips it.

Dates are interpreted in Singapore time. A date range such as `4 - 10 Jun
2026` becomes inclusive boundaries from `2026-06-04 00:00:00 +08:00` through
`2026-06-10 23:59:59.999 +08:00`.

## Refresh Decisions

Refresh decisions are made independently for each series:

1. Discover the current publication and validity dates.
2. Find the latest stored flyer for the same series.
3. If the discovered `validFrom` equals the stored `validFrom`, skip asset
   fetching and parsing.
4. If the discovered `validFrom` is newer, delete every deal attached to older
   flyers in that series, including pending, approved, and rejected deals.
5. Store and parse the new publication after stale deals have been removed.
6. If parsing or storage fails after a newer publication was confirmed, old
   deals remain removed. Expired promotions must not be restored as fallback.
7. If today's Singapore date is later than a stored flyer's `validTo`, delete
   that series' deals even when discovery does not return a replacement.
8. If discovery fails and the stored flyer is still within its validity range,
   retain its deals and record the source failure.

Old flyer records remain for diagnostics and audit history. Their deals do not
remain visible after replacement or expiry.

All destructive replacement work and creation of the new flyer/deals should be
performed in a transaction where supported. The required clear-on-failure
behavior refers to extraction failure after a newer dated publication has been
confirmed: the stale-deal deletion commits even if the later import does not.

## Data Model

`PromotionFlyer` gains a required `seriesKey` string. It continues to store
`validFrom`, `validTo`, source URLs, asset hash, parse status, and error
message.

Indexes support:

- Latest flyer lookup by `seriesKey` and `validFrom`
- Expiry lookup by `seriesKey` and `validTo`

No fuzzy matching or automatic product catalogue changes are introduced.
Promotion candidates remain separate from shelf-price snapshots.

## Extraction

The parser processes every page in a publication and returns only snack and ice
cream promotions.

Extraction order:

1. Prefer structured public metadata when the retailer exposes product
   hotspots or accessible product labels.
2. Otherwise run positioned OCR on each flyer page.
3. Associate a title, pack size, price, and promotion within the same visual
   card bounds.
4. Validate the complete candidate before returning it.

A candidate is trustworthy only when:

- Its title is readable and contains a supported category keyword.
- It has a parsed positive price or a recognized complete promotion such as
  `BUY 1 GET 1 FREE`.
- Its title and price/promotion belong to the same visual card.
- It meets the configured confidence threshold.
- It is not navigation, legal, validity, banner, or unrelated product text.

Unknown flyer IDs must not use hardcoded product rows. Existing hardcoded
publication-specific deal lists are removed after equivalent fixtures cover
the generic parser.

Low-confidence or incomplete OCR output is discarded rather than added to the
review queue. This specifically prevents candidates such as fragmented Pocky
text with no price from being imported.

## Query Behavior

The public Deals page and promotion review page continue querying
`PromotionDeal`, but only current flyers can retain deals after refresh.
Queries should also apply the current Singapore date to `validFrom` and
`validTo` as defense in depth, so an expired deal cannot surface if a scheduled
refresh was missed.

Retailer filter options are derived from current approved deals only.

## Result Reporting

The refresh response reports:

- Publications discovered
- Publications skipped as unchanged
- Stale deals removed
- Flyers imported
- Candidates created
- Parse or discovery failures by series

Failure details are server-side diagnostics. The UI presents a concise summary
and directs users to the review queue when candidates were created.

## Testing

Tests use saved public-source fixtures and mocked persistence. They do not
connect to or mutate production data.

Required coverage:

- Both FairPrice series are discovered with all pages and parsed date ranges.
- Same `validFrom` skips asset fetching and parsing.
- A newer publication removes all deal statuses only for its own series.
- A newer FairPrice Must Buy flyer does not remove Weekly Savers deals.
- Expired deals are removed when no replacement exists.
- A still-valid flyer remains when source discovery fails.
- A newer publication clears stale deals even when replacement parsing fails.
- FairPrice and Cold Storage date formats are interpreted in Singapore time.
- The current FairPrice fixtures produce expected Magnum and snack candidates.
- Fragmented or low-confidence OCR output produces no candidate.
- Sheng Siong with no reliable flyer is skipped without failing the refresh.
- Public and review queries exclude expired or not-yet-valid flyers.

Before deployment, run `npm test`, `npm run typecheck`, `npm run lint`,
`npx prisma validate`, and `npm run build`.

## Deployment Verification

Deploy through the existing GitHub-to-Vercel flow. Confirm the production route
and pages are healthy without invoking the mutation endpoint. The user performs
the first production refresh from the UI and verifies that stale deals vanish,
both FairPrice series import independently, and only readable candidates enter
review.
