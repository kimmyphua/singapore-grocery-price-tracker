# Manual RedMart Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in user queue RedMart refreshes while an allowlisted administrator processes all pending work from local Chrome with one manual command.

**Architecture:** Vercel owns a durable, deduplicated refresh queue and exposes authenticated user/admin endpoints plus token-protected collector endpoints. A local TypeScript collector claims leased jobs, uses the existing public-page RedMart browser adapter, and submits normalized results that production stores atomically with job completion. Cloud-capable retailers continue refreshing immediately; RedMart never runs inside the Vercel refresh request.

**Tech Stack:** Next.js 14 App Router, TypeScript 5.6, Prisma 5/PostgreSQL, Supabase session auth, Zod, Playwright Core with local Chrome, Vitest and Testing Library.

## Global Constraints

- Use public pages only; do not implement Lazada login, cart scraping, account-specific pricing, CAPTCHA handling, proxies, or anti-bot bypasses.
- Only allowlisted emails can access `/admin/redmart` or admin queue mutations.
- Collector endpoints require a timing-safe comparison with `REDMART_COLLECTOR_TOKEN`; the token must never reach client code or logs.
- Claim at most 10 jobs per run with a 15-minute lease.
- Process jobs sequentially with at least two seconds between browser collections.
- A normal sale without multibuy is a valid completed result; `data.sections` multibuy data is optional enrichment.
- Match submitted results to the claimed RedMart item and SKU identifiers before writing a snapshot.
- Do not silently auto-merge fuzzy product matches.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate` before release.

---

## File Structure

### Create

- `prisma/migrations/20260620120000_add_redmart_refresh_jobs/migration.sql`: enum, job table, indexes, foreign keys.
- `src/lib/auth/admin.ts`: admin allowlist parsing and page/API guards.
- `src/lib/redmart/collector-auth.ts`: bearer-token extraction and timing-safe validation.
- `src/lib/redmart/jobs.ts`: queue, claim, completion, failure, lease, and list operations.
- `src/lib/redmart/collector.ts`: dependency-injected local collector orchestration.
- `scripts/refresh-redmart.ts`: local command entry point.
- `src/app/api/redmart/refresh/route.ts`: signed-in user queue endpoint.
- `src/app/api/admin/redmart/refresh/route.ts`: admin queue-all/retry endpoint.
- `src/app/api/collector/redmart/jobs/claim/route.ts`: collector claim endpoint.
- `src/app/api/collector/redmart/jobs/[id]/result/route.ts`: collector completion/failure endpoint.
- `src/app/admin/redmart/page.tsx`: protected queue dashboard.
- `src/app/admin/redmart/redmart-admin-actions.tsx`: client-side queue/retry controls.
- `tests/admin-auth.test.ts`, `tests/redmart-jobs.test.ts`, `tests/redmart-collector-auth.test.ts`, `tests/redmart-collector.test.ts`, `tests/redmart-routes.test.ts`, `tests/redmart-admin-page.test.tsx`: focused feature coverage.

### Modify

- `prisma/schema.prisma`: add `RedMartRefreshStatus`, `RedMartRefreshJob`, and relations.
- `.env.example`, `src/lib/env.ts`, `tests/env.test.ts`: document and parse admin/collector settings.
- `src/lib/pricing/refresh-prices.ts`, `tests/shared-listing-refresh.test.ts`: exclude RedMart from cloud refresh and expose atomic parsed-result storage.
- `src/lib/scraping/redmart-product-page.ts`, `tests/redmart-product-page.test.ts`: verify `data.sections` multibuy payloads and export stable item/SKU extraction.
- `src/lib/products/queries.ts`, `src/app/products/[slug]/page.tsx`, `src/app/refresh-button.tsx`, `tests/tracked-products.test.ts`, `tests/authenticated-pages.test.tsx`: show and queue RedMart status.
- `package.json`, `package-lock.json`: add the local `redmart:refresh` command without adding a dependency.

---

### Task 1: Database and Server Configuration Contract

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260620120000_add_redmart_refresh_jobs/migration.sql`
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Modify: `tests/env.test.ts`
- Modify: `tests/schema-contract.test.ts`
- Modify: `tests/migration-behavior.test.ts`

**Interfaces:**
- Produces: `RedMartRefreshStatus`, Prisma `redMartRefreshJob`, and `parseRedMartServerEnv(input): { adminEmails: string[]; collectorToken: string }`.
- Consumes: existing `UserProfile`, `RetailerListing`, `APP_ORIGIN`, and Zod environment patterns.

- [ ] **Step 1: Write failing schema and environment tests**

Add assertions that the schema contains the status enum, nullable unique `activeKey`, lease fields, and both relations. Add this environment contract:

```ts
expect(
  parseRedMartServerEnv({
    ADMIN_EMAILS: " KimberlyPhuaWeyHan@gmail.com,admin@example.com ",
    REDMART_COLLECTOR_TOKEN: "x".repeat(32)
  })
).toEqual({
  adminEmails: ["kimberlyphuaweyhan@gmail.com", "admin@example.com"],
  collectorToken: "x".repeat(32)
});

expect(() =>
  parseRedMartServerEnv({
    ADMIN_EMAILS: "not-an-email",
    REDMART_COLLECTOR_TOKEN: "short"
  })
).toThrow();
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- tests/env.test.ts tests/schema-contract.test.ts tests/migration-behavior.test.ts`

Expected: FAIL because `parseRedMartServerEnv` and the RedMart job schema do not exist.

- [ ] **Step 3: Add the Prisma model and SQL migration**

Use this model contract:

```prisma
enum RedMartRefreshStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model RedMartRefreshJob {
  id                String               @id @default(cuid())
  listingId         String
  requestedById     String
  status            RedMartRefreshStatus @default(PENDING)
  activeKey         String?              @unique
  attemptCount      Int                  @default(0)
  leaseExpiresAt    DateTime?
  failureCategory   String?
  failureMessage    String?
  createdAt         DateTime             @default(now())
  claimedAt         DateTime?
  completedAt       DateTime?
  updatedAt         DateTime             @updatedAt
  listing           RetailerListing      @relation(fields: [listingId], references: [id], onDelete: Cascade)
  requestedBy       UserProfile          @relation(fields: [requestedById], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@index([listingId, createdAt])
}
```

Add `redMartRefreshJobs RedMartRefreshJob[]` to `UserProfile` and `RetailerListing`. The SQL migration must create the enum/table, a unique index on `activeKey`, status/created and listing/created indexes, and cascading foreign keys.

- [ ] **Step 4: Add strict environment parsing and documentation**

Implement:

```ts
const redMartServerEnvSchema = z.object({
  ADMIN_EMAILS: z.string().transform((value, context) => {
    const emails = value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0 || emails.some((email) => !z.string().email().safeParse(email).success)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "ADMIN_EMAILS must contain valid email addresses." });
      return z.NEVER;
    }
    return [...new Set(emails)];
  }),
  REDMART_COLLECTOR_TOKEN: z.string().min(32)
});

export function parseRedMartServerEnv(input: Record<string, string | undefined>) {
  const value = redMartServerEnvSchema.parse(input);
  return { adminEmails: value.ADMIN_EMAILS, collectorToken: value.REDMART_COLLECTOR_TOKEN };
}
```

Document both variables in `.env.example` with non-secret example values.

- [ ] **Step 5: Generate Prisma and rerun focused tests**

Run: `npm run db:generate`

Expected: Prisma Client generation succeeds.

Run: `npm test -- tests/env.test.ts tests/schema-contract.test.ts tests/migration-behavior.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260620120000_add_redmart_refresh_jobs/migration.sql .env.example src/lib/env.ts tests/env.test.ts tests/schema-contract.test.ts tests/migration-behavior.test.ts
git commit -m "feat: add RedMart refresh job schema"
```

---

### Task 2: Admin and Collector Authorization

**Files:**
- Create: `src/lib/auth/admin.ts`
- Create: `src/lib/redmart/collector-auth.ts`
- Create: `tests/admin-auth.test.ts`
- Create: `tests/redmart-collector-auth.test.ts`

**Interfaces:**
- Produces: `isAdminEmail(email, allowlist)`, `requireAdminPage()`, `requireAdminSession()`, `isCollectorAuthorized(request, expectedToken)`, `collectorUnauthorizedResponse()`.
- Consumes: `requireProtectedPage`, `requireAppSession`, `parseRedMartServerEnv`, `crypto.timingSafeEqual`, and `AuthContext`.

- [ ] **Step 1: Write failing authorization tests**

Cover case-insensitive admin matching, non-admin rejection, missing/malformed bearer headers, wrong equal-length token, wrong different-length token, and a valid token:

```ts
expect(isAdminEmail("KimberlyPhuaWeyHan@gmail.com", ["kimberlyphuaweyhan@gmail.com"])).toBe(true);
expect(isAdminEmail("other@example.com", ["kimberlyphuaweyhan@gmail.com"])).toBe(false);

expect(isCollectorAuthorized(new Request("https://app.test"), token)).toBe(false);
expect(isCollectorAuthorized(requestWithBearer("wrong-token"), token)).toBe(false);
expect(isCollectorAuthorized(requestWithBearer(token), token)).toBe(true);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/admin-auth.test.ts tests/redmart-collector-auth.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement admin guards**

Use dependency injection for tests and redirect non-admin pages to `/`:

```ts
export function isAdminEmail(email: string, allowlist: string[]) {
  return allowlist.includes(email.trim().toLowerCase());
}

export async function requireAdminPage() {
  const session = await requireProtectedPage();
  const { adminEmails } = parseRedMartServerEnv(process.env);
  if (!isAdminEmail(session.email, adminEmails)) redirect("/");
  return session;
}

export async function requireAdminSession() {
  const session = await requireAppSession();
  const { adminEmails } = parseRedMartServerEnv(process.env);
  if (!isAdminEmail(session.email, adminEmails)) throw new AdminAuthorizationError();
  return session;
}
```

- [ ] **Step 4: Implement constant-time collector authentication**

```ts
export function isCollectorAuthorized(request: Request, expectedToken: string) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
```

Return the same `401 { error: "UNAUTHORIZED" }` for every collector-auth failure.

- [ ] **Step 5: Rerun tests and commit**

Run: `npm test -- tests/admin-auth.test.ts tests/redmart-collector-auth.test.ts`

Expected: PASS.

```bash
git add src/lib/auth/admin.ts src/lib/redmart/collector-auth.ts tests/admin-auth.test.ts tests/redmart-collector-auth.test.ts
git commit -m "feat: protect RedMart admin and collector access"
```

---

### Task 3: Durable Queue, Leasing, and Job History

**Files:**
- Create: `src/lib/redmart/jobs.ts`
- Create: `tests/redmart-jobs.test.ts`

**Interfaces:**
- Produces:
  - `queueOwnerRedMartRefreshes(ownerId: string, requestedById: string, trackedProductId?: string): Promise<QueueSummary>`
  - `queueAllRedMartRefreshes(requestedById: string): Promise<QueueSummary>`
  - `retryRedMartRefresh(jobId: string, requestedById: string): Promise<QueuedJob>`
  - `claimRedMartJobs(now?: Date, limit?: number): Promise<ClaimedRedMartJob[]>`
  - `listRedMartRefreshJobs(limit?: number): Promise<RedMartAdminJob[]>`
- `QueueSummary` is `{ created: number; alreadyActive: number; skipped: number; jobs: QueuedJob[] }`.
- `ClaimedRedMartJob` is `{ id; listingId; productUrl; expectedItemId; expectedSkuId; leaseExpiresAt }`.
- Consumes: Prisma job model and RedMart URL identity helpers from Task 6; initially keep the URL parser private, then replace it with the shared export in Task 6.

- [ ] **Step 1: Write failing queue-service tests against an in-memory store**

Tests must prove:

```ts
await expect(queueOwnerRedMartRefreshes(store, "owner-1", "profile-1", "product-1"))
  .resolves.toMatchObject({ created: 1, alreadyActive: 0, skipped: 0 });

await expect(queueOwnerRedMartRefreshes(store, "owner-1", "profile-1", "product-1"))
  .resolves.toMatchObject({ created: 0, alreadyActive: 1 });

expect(await claimRedMartJobs(store, new Date("2026-06-20T00:00:00Z"), 10)).toHaveLength(1);
expect(store.jobs[0]).toMatchObject({ status: "PROCESSING", attemptCount: 1 });
```

Also cover ownership rejection, non-RedMart skipping, a maximum of 10 claims, reclaim only after the 15-minute lease expires, terminal `activeKey` clearing, and retry creating a new job rather than mutating history.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- tests/redmart-jobs.test.ts`

Expected: FAIL because `src/lib/redmart/jobs.ts` is missing.

- [ ] **Step 3: Define a narrow store and implement queue behavior**

Use a store interface so concurrency rules are testable without a database:

```ts
export type RedMartJobStore = {
  resolveOwnerListings(ownerId: string, trackedProductId?: string): Promise<QueueCandidate[]>;
  resolveAllListings(): Promise<QueueCandidate[]>;
  createPending(candidate: QueueCandidate, requestedById: string): Promise<QueuedJob | "ACTIVE">;
  retryFailed(jobId: string, requestedById: string): Promise<QueuedJob>;
  claim(now: Date, limit: number, leaseExpiresAt: Date): Promise<ClaimedRedMartJob[]>;
  list(limit: number): Promise<RedMartAdminJob[]>;
};
```

Filter candidates to retailer slug `redmart`; pass `activeKey: listing.id` on creation and convert Prisma unique conflicts to `"ACTIVE"`.

- [ ] **Step 4: Implement atomic PostgreSQL claiming**

Inside a Prisma transaction, select `PENDING` jobs plus expired `PROCESSING` jobs with `FOR UPDATE SKIP LOCKED`, ordered by `createdAt`, limited to 10. Update selected rows to `PROCESSING`, set `claimedAt`, set `leaseExpiresAt` to `now + 15 minutes`, and increment `attemptCount`. Return only public URL and identity fields.

- [ ] **Step 5: Rerun focused tests and commit**

Run: `npm test -- tests/redmart-jobs.test.ts`

Expected: PASS.

```bash
git add src/lib/redmart/jobs.ts tests/redmart-jobs.test.ts
git commit -m "feat: add durable RedMart refresh queue"
```

---

### Task 4: Atomic Collector Result Storage

**Files:**
- Modify: `src/lib/pricing/refresh-prices.ts`
- Modify: `src/lib/redmart/jobs.ts`
- Modify: `tests/shared-listing-refresh.test.ts`
- Modify: `tests/redmart-jobs.test.ts`

**Interfaces:**
- Produces:
  - `storeParsedListingResult(operations, listing, parsed): Promise<void>`
  - `completeRedMartJob(jobId: string, parsed: ParsedRetailerProduct, now?: Date): Promise<void>`
  - `failRedMartJob(jobId: string, failure: RedMartJobFailure, now?: Date): Promise<void>`
- `RedMartJobFailure` is `{ category: "BLOCKED" | "TIMEOUT" | "INVALID_RESPONSE" | "IDENTITY_MISMATCH" | "UNAVAILABLE" | "INTERNAL"; message: string }`.
- Consumes: existing `ListingRefreshOperations`, `parsePackSize`, `ScrapeAttempt`, and `PriceSnapshot` writes.

- [ ] **Step 1: Write failing parsed-result and job-completion tests**

Extract the successful refresh assertions already in `tests/shared-listing-refresh.test.ts` into a test for `storeParsedListingResult`. Add job tests proving that a valid RedMart result creates one snapshot and completes the job, while an item/SKU mismatch creates no snapshot and fails the job:

```ts
await expect(completeRedMartJob(store, "job-1", validRedMartResult, now)).resolves.toBeUndefined();
expect(store.snapshots).toHaveLength(1);
expect(store.jobs[0]).toMatchObject({ status: "COMPLETED", activeKey: null });

await expect(completeRedMartJob(store, "job-2", mismatchedResult, now))
  .rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
expect(store.snapshots).toHaveLength(0);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/shared-listing-refresh.test.ts tests/redmart-jobs.test.ts`

Expected: FAIL because the shared persistence function and terminal operations are absent.

- [ ] **Step 3: Extract shared normalized-result persistence**

Move only the successful parsed-result validation and writes from `refreshRetailerListing` into:

```ts
export async function storeParsedListingResult(
  operations: ListingRefreshOperations,
  listing: RefreshListing,
  parsed: ParsedRetailerProduct
) {
  if (parsed.price === null || !Number.isFinite(parsed.price) || parsed.price <= 0) {
    throw new InvalidScrapePriceError();
  }
  const totalSize = listing.totalSize ?? parsePackSize(`${parsed.titleRaw} ${parsed.size ?? ""}`).totalSize;
  await operations.updateListing(listing.id, parsed);
  await operations.createSnapshot({
    retailerListingId: listing.id,
    price: parsed.price,
    originalPrice: positiveOrNull(parsed.originalPrice),
    unitPrice: parsed.price / totalSize,
    promotionText: normalizeOptional(parsed.promotionText),
    currency: normalizeOptional(parsed.currency) ?? "SGD",
    isAvailable: parsed.isAvailable
  });
}
```

Keep the existing cloud refresh behavior unchanged for non-RedMart retailers.

- [ ] **Step 4: Complete or fail jobs transactionally**

`completeRedMartJob` must lock the job, require `PROCESSING` and a non-expired lease, validate RedMart URL identity, create a `MANUAL` scrape attempt, call `storeParsedListingResult`, finish the attempt, and mark the job `COMPLETED` with `activeKey: null` in one Prisma transaction. `failRedMartJob` sanitizes the message to one line and 300 characters, records a failed/blocked attempt, and marks the job `FAILED` with the same atomicity.

- [ ] **Step 5: Rerun tests and commit**

Run: `npm test -- tests/shared-listing-refresh.test.ts tests/redmart-jobs.test.ts`

Expected: PASS.

```bash
git add src/lib/pricing/refresh-prices.ts src/lib/redmart/jobs.ts tests/shared-listing-refresh.test.ts tests/redmart-jobs.test.ts
git commit -m "feat: store RedMart collector results atomically"
```

---

### Task 5: Protected User, Admin, and Collector APIs

**Files:**
- Create: `src/app/api/redmart/refresh/route.ts`
- Create: `src/app/api/admin/redmart/refresh/route.ts`
- Create: `src/app/api/collector/redmart/jobs/claim/route.ts`
- Create: `src/app/api/collector/redmart/jobs/[id]/result/route.ts`
- Create: `tests/redmart-routes.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/redmart/refresh` with `{ trackedProductId?: string }`.
  - `POST /api/admin/redmart/refresh` with `{ action: "queue-all" }` or `{ action: "retry"; jobId: string }`.
  - `POST /api/collector/redmart/jobs/claim` with no body.
  - `POST /api/collector/redmart/jobs/:id/result` with `{ status: "COMPLETED"; result }` or `{ status: "FAILED"; failure }`.
- Consumes: Tasks 2-4 guards and job functions, `requireSameOrigin` for session-cookie mutations, and Zod route schemas.

- [ ] **Step 1: Write failing route tests**

Test route handlers with mocked services. Required cases are same-origin rejection, unauthenticated `401`, non-owner empty queue, non-admin `403`, missing/incorrect collector token `401`, malformed payload `422`, valid claim `200`, completion `200`, and identity mismatch `409`.

Example successful user response:

```ts
expect(response.status).toBe(201);
await expect(response.json()).resolves.toEqual({
  created: 1,
  alreadyActive: 0,
  skipped: 0,
  jobs: [expect.objectContaining({ status: "PENDING" })]
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm test -- tests/redmart-routes.test.ts`

Expected: FAIL because route modules do not exist.

- [ ] **Step 3: Implement the user and admin endpoints**

The user endpoint calls `requireSameOrigin`, `requireAppSession`, validates the optional product ID, and calls `queueOwnerRedMartRefreshes(session.profileId, session.profileId, trackedProductId)`. The admin endpoint uses the same origin protection plus `requireAdminSession`, then dispatches only the two explicit actions.

- [ ] **Step 4: Implement collector endpoints**

Both endpoints parse `REDMART_COLLECTOR_TOKEN` server-side and call `isCollectorAuthorized` before reading request bodies. Claim always passes limit 10. Result validation uses a discriminated Zod union and never accepts raw HTML, headers, or cookies.

- [ ] **Step 5: Rerun tests and commit**

Run: `npm test -- tests/redmart-routes.test.ts`

Expected: PASS.

```bash
git add src/app/api/redmart/refresh/route.ts src/app/api/admin/redmart/refresh/route.ts src/app/api/collector/redmart/jobs/claim/route.ts src/app/api/collector/redmart/jobs/[id]/result/route.ts tests/redmart-routes.test.ts
git commit -m "feat: expose protected RedMart refresh APIs"
```

---

### Task 6: RedMart Parser Coverage and Local Collector Command

**Files:**
- Modify: `src/lib/scraping/redmart-product-page.ts`
- Modify: `tests/redmart-product-page.test.ts`
- Create: `src/lib/redmart/collector.ts`
- Create: `scripts/refresh-redmart.ts`
- Create: `tests/redmart-collector.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces:
  - `getRedMartProductIdentity(url: string): { itemId: string; skuId: string } | null`.
  - `runRedMartCollector(dependencies, options?): Promise<CollectorSummary>`.
  - `npm run redmart:refresh`.
- `CollectorSummary` is `{ claimed: number; completed: number; failed: number }`.
- Consumes: claim/result APIs and `scrapeRedMartBrowserProductPage`.

- [ ] **Step 1: Add failing parser tests for both production shapes**

Add the captured `data.sections` shape, with only the matching product receiving the promotion:

```ts
const payload = JSON.stringify({
  data: {
    sections: [{
      descriptionText: "Any 2 For $27.50",
      title: "Any 2 For $27.50",
      products: [
        { itemId: "2896336114", skuId: "20072727483", title: "Haagen-Dazs Pistachio 420ML" },
        { itemId: "301126782", skuId: "527208586", title: "Haagen-Dazs Green Tea 473ML" }
      ]
    }]
  }
});

expect(extractRedMartPromotionTextFromApiPayload([payload], {
  productUrl: "https://www.lazada.sg/products/pdp-i2896336114-s20072727483.html",
  retailerSku: "20072727483",
  titleRaw: "Haagen-Dazs Pistachio 420ML"
})).toBe("Any 2 For $27.50");
```

Retain and explicitly name the sale-only rendered-price test so a missing multibuy response still returns current price, original price, and size.

- [ ] **Step 2: Add failing collector orchestration tests**

Inject `claim`, `scrape`, `submit`, and `sleep`. Prove sequential processing, a 2,000 ms delay between jobs, continuation after one scrape failure, and no delay after the final job:

```ts
expect(await runRedMartCollector(deps)).toEqual({ claimed: 2, completed: 1, failed: 1 });
expect(deps.scrape).toHaveBeenCalledTimes(2);
expect(deps.sleep).toHaveBeenCalledTimes(1);
expect(deps.sleep).toHaveBeenCalledWith(2000);
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- tests/redmart-product-page.test.ts tests/redmart-collector.test.ts`

Expected: FAIL on the new identity export and collector module.

- [ ] **Step 4: Implement parser identity and collector orchestration**

Identity extraction must match `/pdp-i(\d+)-s(\d+)\.html` and return `null` for any other URL. Keep recursive promotion discovery, which supports both `modules` and `sections`; ensure `descriptionText` is considered when `title` is absent.

The collector loop is:

```ts
export async function runRedMartCollector(deps: CollectorDependencies): Promise<CollectorSummary> {
  const jobs = await deps.claim();
  let completed = 0;
  let failed = 0;
  for (const [index, job] of jobs.entries()) {
    try {
      const result = await deps.scrape(job.productUrl);
      await deps.submit(job.id, { status: "COMPLETED", result });
      completed += 1;
    } catch (error) {
      await deps.submit(job.id, { status: "FAILED", failure: classifyCollectorFailure(error) });
      failed += 1;
    }
    if (index < jobs.length - 1) await deps.sleep(2000);
  }
  return { claimed: jobs.length, completed, failed };
}
```

- [ ] **Step 5: Add the executable command**

Use `loadEnvConfig(process.cwd())` from `@next/env`, validate `APP_ORIGIN` with `parseAuthServerEnv`, validate the collector token with `parseRedMartServerEnv`, create bearer-authenticated `fetch` dependencies, run the collector, print one JSON summary, and set `process.exitCode = 1` only when claim/submission infrastructure fails.

Add:

```json
"redmart:refresh": "tsx scripts/refresh-redmart.ts"
```

- [ ] **Step 6: Rerun tests and commit**

Run: `npm test -- tests/redmart-product-page.test.ts tests/redmart-collector.test.ts`

Expected: PASS.

```bash
git add src/lib/scraping/redmart-product-page.ts tests/redmart-product-page.test.ts src/lib/redmart/collector.ts scripts/refresh-redmart.ts tests/redmart-collector.test.ts package.json package-lock.json
git commit -m "feat: add local RedMart collector command"
```

---

### Task 7: User Refresh Flow and Visible Queue State

**Files:**
- Modify: `src/lib/pricing/refresh-prices.ts`
- Modify: `tests/shared-listing-refresh.test.ts`
- Modify: `src/app/api/prices/refresh/route.ts`
- Modify: `src/lib/products/queries.ts`
- Modify: `src/app/products/[slug]/page.tsx`
- Modify: `src/app/refresh-button.tsx`
- Modify: `tests/tracked-products.test.ts`
- Modify: `tests/authenticated-pages.test.tsx`
- Modify: `tests/api-services.test.ts`

**Interfaces:**
- Produces: combined refresh response `{ immediate: RefreshSummary; redmart: QueueSummary }` and product listing field `redMartRefreshJobs[0]`.
- Consumes: `queueOwnerRedMartRefreshes`, existing cached prices, and current product refresh button.

- [ ] **Step 1: Write failing service and UI tests**

Update the shared refresh store test so owner/scheduled listing selection excludes retailer slug `redmart`. Route tests must prove one click invokes immediate cloud refresh and RedMart queueing. UI tests must assert these exact states:

```tsx
"Waiting for RedMart refresh"
"RedMart refresh in progress"
"RedMart refresh failed: Retailer blocked the public request"
"RedMart verified 20 Jun 2026"
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/shared-listing-refresh.test.ts tests/api-services.test.ts tests/tracked-products.test.ts tests/authenticated-pages.test.tsx`

Expected: FAIL because RedMart is still sent through cloud refresh and no job state is queried.

- [ ] **Step 3: Exclude RedMart from cloud refresh and queue it in the route**

Filter `resolveOwnerListingIds` and `listActiveListingIds` with `retailer: { slug: { not: "redmart" } }`. In `/api/prices/refresh`, run cloud refresh first, then call `queueOwnerRedMartRefreshes` for the same owner/product, and return both summaries with `201`.

- [ ] **Step 4: Query and render the latest RedMart job**

Extend `trackedProductQueryArgs` under each `retailerListing`:

```ts
redMartRefreshJobs: {
  orderBy: { createdAt: "desc" },
  take: 1
}
```

Render queue status only for the RedMart card. Completed state uses the latest price snapshot timestamp; failed state uses the bounded stored job message.

- [ ] **Step 5: Update refresh feedback**

Keep one `Refresh prices` button. Its loading overlay says `Refreshing supermarket prices and queueing RedMart...`; successful reload reveals the job state. Error copy remains generic and does not expose server details.

- [ ] **Step 6: Rerun tests and commit**

Run: `npm test -- tests/shared-listing-refresh.test.ts tests/api-services.test.ts tests/tracked-products.test.ts tests/authenticated-pages.test.tsx`

Expected: PASS.

```bash
git add src/lib/pricing/refresh-prices.ts tests/shared-listing-refresh.test.ts src/app/api/prices/refresh/route.ts src/lib/products/queries.ts src/app/products/[slug]/page.tsx src/app/refresh-button.tsx tests/tracked-products.test.ts tests/authenticated-pages.test.tsx tests/api-services.test.ts
git commit -m "feat: queue RedMart from product refresh"
```

---

### Task 8: Admin RedMart Dashboard

**Files:**
- Create: `src/app/admin/redmart/page.tsx`
- Create: `src/app/admin/redmart/redmart-admin-actions.tsx`
- Create: `tests/redmart-admin-page.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `tests/app-session-enforcement.test.ts`

**Interfaces:**
- Produces: protected `/admin/redmart` dashboard with queue-all and retry controls.
- Consumes: `requireAdminPage`, `listRedMartRefreshJobs`, and `/api/admin/redmart/refresh`.

- [ ] **Step 1: Write failing page tests**

Verify the page calls the admin guard before querying, shows counts and rows, displays the manual command, and emits no collector token. Verify the main navigation shows `RedMart admin` only for an allowlisted session.

Required page copy includes:

```text
RedMart refresh queue
npm run redmart:refresh
Queue all tracked RedMart
This page queues work. Run the command on the authorized Mac to collect it.
```

- [ ] **Step 2: Run page tests and verify failure**

Run: `npm test -- tests/redmart-admin-page.test.tsx tests/app-session-enforcement.test.ts`

Expected: FAIL because the admin page and controls do not exist.

- [ ] **Step 3: Implement the protected server page**

Call `requireAdminPage()` before `listRedMartRefreshJobs(100)`. Render status summary cards and a table containing product title, retailer URL, requester email, status, attempts, created/claimed/completed timestamps, and sanitized failure details.

- [ ] **Step 4: Implement client controls**

`Queue all tracked RedMart` posts `{ action: "queue-all" }`; failed-row retry posts `{ action: "retry", jobId }`. Both disable while pending, show a concise result, and call `window.location.reload()` after success. Never place the collector token in props, HTML, or requests from this component.

- [ ] **Step 5: Gate the navigation link and rerun tests**

Use the same `isAdminEmail` helper with the verified session email. Do not duplicate allowlist parsing in the layout.

Run: `npm test -- tests/redmart-admin-page.test.tsx tests/app-session-enforcement.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/redmart/page.tsx src/app/admin/redmart/redmart-admin-actions.tsx tests/redmart-admin-page.test.tsx src/app/layout.tsx tests/app-session-enforcement.test.ts
git commit -m "feat: add RedMart admin refresh dashboard"
```

---

### Task 9: Full Verification, Deployment, and Production Acceptance

**Files:**
- Modify only if verification exposes a defect in files already owned by Tasks 1-8.

**Interfaces:**
- Consumes: complete feature and production Vercel/Supabase configuration.
- Produces: deployed migration/application and verified production snapshots for sale-only and multibuy RedMart products.

- [ ] **Step 1: Run the full automated verification suite**

Run: `npm test`

Expected: all Vitest suites pass.

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

Run: `DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" npx prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 2: Review the diff for security and scope**

Run: `git diff origin/main...HEAD --check`

Expected: no whitespace errors.

Run: `rg -n "REDMART_COLLECTOR_TOKEN|collectorToken" src/app src/lib scripts`

Expected: references exist only in server modules and the local script; no `"use client"` file imports or renders the token.

- [ ] **Step 3: Push `main` and apply production configuration**

Run `openssl rand -hex 32` once and store its output in the local password manager. Set these Vercel production secrets without printing their values:

```text
ADMIN_EMAILS=kimberlyphuaweyhan@gmail.com
REDMART_COLLECTOR_TOKEN=the 64-character value generated by openssl
```

Set local `.env.local` to the same token and:

```text
APP_ORIGIN=https://singapore-grocery-price-tracker.vercel.app
```

Apply `prisma/migrations/20260620120000_add_redmart_refresh_jobs/migration.sql` to production before sending application traffic to the new routes. Push `main` and wait for the Vercel production deployment to become Ready.

- [ ] **Step 4: Test sale-only RedMart production flow**

Queue the Bulla sale-only listing:

```text
https://www.lazada.sg/products/pdp-i3646271199-s24102891696.html
```

Run: `npm run redmart:refresh`

Expected command summary: `claimed >= 1`, `completed >= 1`, `failed = 0`. Verify production stores current price `$12.96`, original price `$15.84`, availability, and no requirement for a multibuy response.

- [ ] **Step 5: Test multibuy RedMart production flow**

Queue the Haagen-Dazs listing:

```text
https://www.lazada.sg/products/pdp-i2896336114-s20072727483.html
```

Run: `npm run redmart:refresh`

Expected command summary: `claimed >= 1`, `completed >= 1`, `failed = 0`. Verify production stores current price `$14.78`, pack size `420 ml`, and promotion `Any 2 For $27.50` when that public offer remains active. If the retailer has changed the offer, compare against the public page observed during the same run and record the current value instead.

- [ ] **Step 6: Verify ordinary-user boundaries**

With a non-admin signed-in account, verify product refresh creates a RedMart pending state, `/admin/redmart` redirects to `/`, admin queue returns `403`, and collector endpoints return `401` without the token. Confirm the user does not install anything.

- [ ] **Step 7: Commit any verification-only correction, then push**

If no correction was required, do not create an empty commit. If a focused correction was required:

```bash
git add -u
git commit -m "fix: harden RedMart collector production flow"
git push origin main
```

Wait for the resulting Vercel deployment and repeat Steps 4-6 before declaring completion.
