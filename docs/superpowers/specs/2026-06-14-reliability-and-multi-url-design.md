# Reliability and Multi-URL Design

## Goal

Fix the production flyer, navigation, layout, and product URL workflows without
redesigning the application or broadening scraping beyond public retailer data.

## Confirmed Root Causes

- Cold Storage flyer PDFs were uploaded to the `promotion-flyers` Supabase
  bucket while the deployed application reads from `flyers`.
- FairPrice publication pages refuse iframe embedding, so an in-app iframe
  cannot be made reliable.
- Each page navigation performs repeated Supabase user validation and profile
  upserts, while internal `<a>` elements force full document reloads.
- Product page fetching always sleeps for the scheduled scraper delay, even for
  an interactive preview.
- The product wizard stores only one URL and one preview.
- The current Lazada page still contains valid tracking data, but production
  preview behavior needs a regression test against its current canonical URL.
- Sheng Siong returns a client-rendered Meteor shell. It must only be supported
  if its public client data can be read without login, CAPTCHA handling, or
  anti-bot workarounds.

## Design

### Flyers

Set the production application and scheduled scraper to the same private
Supabase bucket. Keep signed downloads as the PDF delivery mechanism. Return a
controlled not-found response when a stored object is missing instead of an
unhandled 500.

Do not iframe external publication pages that disallow framing. Show a clear
"Open publication" action in a new tab. PDF editions continue to use the
existing PDF.js viewer and signed download route.

### Navigation and Layout

Use Next.js `Link` for internal navigation so route transitions stay inside the
app. Add `src/app/loading.tsx` with a small accessible spinner. Cache the
no-argument server session lookup for the duration of a render request so the
layout and page share authentication/profile work.

Make the root page shell a vertical flex layout and give the main region
`flex-1`, keeping the footer at the viewport bottom on short pages.

Interactive product previews bypass the scheduled scraper's two-second courtesy
delay. Scheduled price and flyer scraping retain the configured delay.

### Multi-URL Product Flow

Replace the single URL input with a textarea accepting one public product URL
per line. Preview URLs sequentially to keep retailer traffic low and show one
editable primary product plus a compact list of all parsed retailer listings.

For a new product, create it from the first preview, then attach the remaining
previews using the existing listing endpoint. For an existing product, attach
each preview sequentially. On success, navigate directly to the product detail
page. Existing server-side identity checks remain authoritative and partial
failure messages identify which URL failed.

### Retailer Support

Keep an explicit retailer adapter boundary. Fix RedMart/Lazada parsing against
the supplied canonical URL and add Sheng Siong only if its public client data is
reliably discoverable. Unknown domains remain unsupported; arbitrary URL
fetching would create SSRF and data-quality risks and conflicts with the
adapter-based project rules.

## Error Handling

- Missing flyer objects return a useful fallback instead of HTTP 500.
- Publication pages never render a known-broken iframe.
- Multi-URL preview and save errors identify the failing URL and preserve
  already parsed rows.
- Unsupported or blocked retailers remain explicit failures.

## Testing

Add focused tests for flyer download errors, publication rendering, request
delay selection, cached session access, current Lazada parsing, URL policy, and
multi-URL parsing/orchestration. Then run the full required project verification:
`npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate`.

