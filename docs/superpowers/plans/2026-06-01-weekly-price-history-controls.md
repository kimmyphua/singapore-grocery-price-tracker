# Weekly Price History Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search, retailer filtering, sorting, and pagination to product weekly price history.

**Architecture:** Keep history controls server-rendered with URL query params so links are shareable and refresh-safe. Extend the cached weekly history query to filter, sort, and paginate mapped weekly rows before rendering. Keep the product page as the only UI integration point.

**Tech Stack:** Next.js App Router, TypeScript, Prisma-backed cached snapshots, Vitest.

---

### Task 1: Weekly History Query Controls

**Files:**
- Modify: `src/lib/pricing/cached-prices.ts`
- Modify: `tests/cached-prices.test.ts`

- [ ] Add failing tests for retailer filter, search query, sort order, and pagination.
- [ ] Extend `getCachedWeeklyPriceHistory` with query options and a paginated return shape.
- [ ] Run `npm test -- tests/cached-prices.test.ts`.

### Task 2: Product Page Controls

**Files:**
- Modify: `src/app/products/[slug]/page.tsx`

- [ ] Read `searchParams` for `retailer`, `q`, `sort`, `direction`, and `page`.
- [ ] Render a GET filter form, sortable column links, and previous/next pagination links.
- [ ] Run `npm run typecheck` and verify rendered localhost HTML includes controls.

### Task 3: Full Verification

**Files:**
- Existing project checks only.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npx prisma validate`.
