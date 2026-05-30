# Weekly Promotions Behaviour

Weekly flyer promotions are a separate import and review workflow from supermarket product prices.

## Source Discovery

The manual refresh endpoint discovers current flyer assets from these public pages:

- FairPrice weekly savers page images from `promotions.fairprice.com.sg`.
- Giant Super Savings PDF from `giant.sg/super-savings`.
- Sheng Siong newspaper advertisement posts and their PDF links.
- Cold Storage Grocery Selections PDF from `coldstorage.com.sg/weekly-ads/Grocery-Selections`.

Downloaded assets are written under `data/weekly-ads/<retailer>/` with a SHA-256 content hash filename. The folder is gitignored. If the same asset hash was imported before, refresh skips it instead of creating duplicate flyers or deals.

Source discovery is best-effort per retailer. If one source blocks public HTML access or changes markup, the refresh continues with the remaining retailers and reports failures rather than blocking the whole import.

## Parsing

The parser first attempts PDF text extraction with `pdfjs-dist`. If the extracted text is sparse, or the source is an image, it uses local OCR through `tesseract.js`. PDF OCR renders pages locally with `@napi-rs/canvas`.

Candidates are created only when extracted text contains a snack or ice cream keyword plus a price or promotion phrase. Keyword classification is intentionally simple for v1:

- `ICE_CREAM`: terms such as ice cream, Magnum, Bulla, Tillamook, Ben & Jerry's.
- `SNACKS`: terms such as snack, chips, KitKat, chocolate, biscuits, wafers, Pringles, Cheetos.

Every extracted candidate starts as `PENDING`.

## Review And Public UI

`/admin/promotions` is the review queue. It shows pending OCR candidates, source flyer details, page number, confidence, and editable fields. Reviewers can approve, reject, or save edits.

`/deals` is the public weekly deals page. It shows approved deals only, with filters for category and retailer.

## Price Comparison Boundary

Flyer deals never update `PriceSnapshot`, product best-value cards, or dashboard best-retailer calculations. Those views continue to use cached verified product prices only.

This boundary protects the comparison UI from OCR mistakes, flyer layout ambiguity, and promotions that are not yet matched to a canonical product.
