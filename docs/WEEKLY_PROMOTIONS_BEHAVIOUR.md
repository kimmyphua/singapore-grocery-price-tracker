# Shared Flyer Behaviour

Flyers are shared source documents, separate from user-owned tracked products
and retailer price snapshots.

## Sources

- Cold Storage Grocery Selections: discover the direct PDF from the approved
  public landing page, store it in the private Supabase `flyers` bucket, and
  serve signed-in downloads through the app.
- FairPrice Weekly Savers: retain the official Publitas publication URL and
  show an embedded viewer with an external-open fallback.

## Deduplication And Retention

The scheduled refresh compares stable source metadata before downloading. A
possible new Cold Storage PDF is SHA-256 hashed before upload; an existing hash
is reused without another stored object or database row.

Only the latest 12 weeks of editions are retained. Stored PDF objects are
deleted before their database rows. External FairPrice URLs are never deleted.

## Price Boundary

Flyer content is informational. It never updates `PriceSnapshot`, product
matching, or best-value calculations.
