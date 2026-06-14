# Reliability and Multi-URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair flyer delivery and navigation performance, add visible loading
feedback, support multiple product URLs, and restore supported retailer parsing.

**Architecture:** Preserve the current Next.js APIs and retailer adapter model.
Use small helpers for interactive fetch timing and URL-list orchestration, reuse
existing single-listing mutations, and fix deployment configuration at its
source.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest, Prisma, Supabase
Storage, Cheerio.

---

### Task 1: Flyer delivery and publication fallback

**Files:**
- Modify: `src/lib/flyers/download.ts`
- Modify: `src/app/api/flyers/[id]/download/route.ts`
- Modify: `src/app/flyers/publication-viewer.tsx`
- Test: `tests/flyer-download.test.ts`
- Test: `tests/flyer-viewers.test.tsx`

- [ ] Write tests proving a missing storage object maps to a controlled response
  and publication editions render an external action instead of an iframe.
- [ ] Run the focused tests and confirm they fail for the missing behavior.
- [ ] Add the minimal error mapping and publication fallback.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Navigation performance, loader, and footer

**Files:**
- Modify: `src/lib/auth/session.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/loading.tsx`
- Modify: internal page files containing application `<a>` navigation
- Test: `tests/auth-session.test.ts`
- Test: `tests/layout-contract.test.tsx`

- [ ] Write tests for one no-argument session lookup per render request and the
  flex/loading/link layout contract.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Cache the default session path, convert internal links to `Link`, add the
  loading spinner, and make the shell a flex column.
- [ ] Run focused tests and confirm they pass.

### Task 3: Interactive preview latency

**Files:**
- Modify: `src/lib/scraping/http.ts`
- Modify: `src/lib/products/preview.ts`
- Test: `tests/product-url-policy.test.ts`
- Test: `tests/product-preview.test.ts`

- [ ] Write a failing test showing interactive preview can explicitly skip the
  scheduled scraper delay while ordinary scraping keeps it.
- [ ] Add a typed fetch option and use it only from product preview.
- [ ] Run focused tests and confirm both paths pass.

### Task 4: Multi-URL product workflow

**Files:**
- Create: `src/lib/products/url-list.ts`
- Modify: `src/app/products/new/product-wizard.tsx`
- Modify: `src/app/products/[slug]/edit/page.tsx`
- Test: `tests/product-url-list.test.ts`
- Test: `tests/product-wizard.test.tsx`

- [ ] Write failing tests for newline parsing, deduplication, sequential preview,
  sequential save, and redirect to the product detail page.
- [ ] Implement the URL-list helper and the smallest wizard state model needed
  for multiple previews.
- [ ] Reuse existing create/attach endpoints sequentially and route to the
  returned or supplied product slug after success.
- [ ] Run focused tests and confirm they pass.

### Task 5: Retailer parsing

**Files:**
- Modify: `src/lib/products/url-policy.ts`
- Modify: `src/lib/products/preview.ts`
- Modify: `src/lib/scraping/parse-product-page.ts`
- Modify: `src/lib/scraping/redmart-product-page.ts`
- Create if public data is viable: `src/lib/scraping/sheng-siong-product-page.ts`
- Test: `tests/product-url-policy.test.ts`
- Test: `tests/redmart-product-page.test.ts`
- Create if viable: `tests/sheng-siong-product-page.test.ts`

- [ ] Add a fixture/regression test for the supplied Lazada canonical URL and
  current tracking/JSON-LD shape.
- [ ] Add Sheng Siong URL-policy and parser tests only after identifying a
  stable public data source.
- [ ] Implement the minimal adapter changes; leave blocked or shell-only pages
  explicitly unsupported.
- [ ] Run retailer-focused tests and confirm they pass.

### Task 6: Configuration, verification, and deployment

**Files:**
- Modify only if needed: `.github/workflows/scheduled-scrape.yml`
- Modify only if needed: `.env.example`

- [ ] Set Vercel `SUPABASE_FLYER_BUCKET` to `promotion-flyers` and verify the
  scheduled scraper uses the same bucket.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npm run build`.
- [ ] Deploy the verified branch and test flyer download, internal navigation,
  multi-URL product creation, retailer attachment redirect, Lazada preview, and
  footer/loading behavior on production.

