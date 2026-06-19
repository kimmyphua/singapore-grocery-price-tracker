# Immediate RedMart Product Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore automatic RedMart previews on Vercel, align the deployed application and scheduled scraper on `main`, and verify the fix against live Lazada product URLs.

**Architecture:** The authenticated preview route will call the existing serverless Chromium RedMart adapter instead of returning an unconditional Vercel failure. The preview service will bound the interactive scrape, classify failures without logging raw upstream content, and preserve the existing manual fallback for genuine failures. The multi-user scheduled workflow will become the default-branch workflow when the reviewed feature branch is fast-forwarded into `main`.

**Tech Stack:** Next.js 14 route handlers, TypeScript, Vitest, Playwright Core, `@sparticuz/chromium`, Prisma, GitHub Actions, Vercel.

## Global Constraints

- Use only public Lazada Singapore product pages and public page responses.
- Do not add login automation, CAPTCHA handling, proxy rotation, or anti-bot bypass logic.
- Preserve low scrape frequency and the configured scraper user agent.
- Treat an actual retailer block as a recorded failed or blocked scrape.
- Keep retailer-specific behavior inside the RedMart adapter.
- Do not silently create a canonical product from incomplete or uncertain data.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate` before completion.

---

### Task 1: Align the Working Branch With `main`

**Files:**
- No file edits.

**Interfaces:**
- Consumes: reviewed branch `codex/multi-user-product-tracking` at the approved plan commit.
- Produces: local `main` containing the multi-user application, design, plan, and enabled scheduled workflow.

- [ ] **Step 1: Confirm both worktrees are clean and record the merge base**

Run:

```bash
git -C /Users/kimberlyphua/Documents/Codex/2026-05-27/i-want-to-build-an-app status --short
git -C /Users/kimberlyphua/.codex/worktrees/0aa5/i-want-to-build-an-app status --short
git merge-base main codex/multi-user-product-tracking
git rev-parse main
```

Expected: both status commands are empty and the merge base equals the current `main` commit.

- [ ] **Step 2: Fast-forward local `main` to the reviewed branch**

Run:

```bash
git -C /Users/kimberlyphua/Documents/Codex/2026-05-27/i-want-to-build-an-app merge --ff-only codex/multi-user-product-tracking
```

Expected: `main` advances without a merge commit or conflict.

- [ ] **Step 3: Confirm the default-branch implementation is present locally**

Run:

```bash
git -C /Users/kimberlyphua/Documents/Codex/2026-05-27/i-want-to-build-an-app log -3 --oneline --decorate
git -C /Users/kimberlyphua/Documents/Codex/2026-05-27/i-want-to-build-an-app diff --check origin/main..main
```

Expected: `main` points at the plan commit and the diff check is clean.

### Task 2: Restore Bounded Vercel RedMart Preview

**Files:**
- Modify: `tests/product-preview.test.ts`
- Modify: `src/lib/products/preview.ts`
- Modify: `src/app/api/products/preview/route.ts`

**Interfaces:**
- Consumes: `scrapeRedMartBrowserProductPage(url): Promise<ParsedRetailerProduct>`.
- Produces: `previewProductUrl(input, dependencies)` that always attempts supported RedMart previews and bounds them with `redMartTimeoutMs`.

- [ ] **Step 1: Replace the deferral regression with live-attempt and timeout tests**

In `tests/product-preview.test.ts`, replace the test named `defers RedMart immediately when the interactive runtime is blocked` with:

```ts
it("attempts RedMart previews in the interactive runtime", async () => {
  const scrapeRedMart = vi.fn().mockResolvedValue({
    retailerSlug: "redmart",
    titleRaw: "Bulla Creamy Classic Vanilla 2L - Frozen",
    price: 12.96,
    originalPrice: 15.84,
    productUrl:
      "https://www.lazada.sg/products/pdp-i3646264233-s24103165302.html",
    imageUrl: "https://example.com/bulla.webp",
    isAvailable: true,
    retailerSku: "24103165302",
    brandRaw: "Bulla",
    currency: "SGD",
    size: "2 L"
  });

  await expect(
    previewProductUrl(
      "https://www.lazada.sg/products/pdp-i3646264233-s24103165302.html",
      { scrapeRedMart }
    )
  ).resolves.toMatchObject({
    retailerSlug: "redmart",
    price: 12.96,
    brand: "Bulla",
    totalSize: 2
  });
  expect(scrapeRedMart).toHaveBeenCalledOnce();
});

it("bounds an interactive RedMart preview", async () => {
  const scrapeRedMart = vi.fn(
    () => new Promise<never>(() => undefined)
  );

  await expect(
    previewProductUrl(
      "https://www.lazada.sg/products/pdp-i3646264233-s24103165302.html",
      { scrapeRedMart, redMartTimeoutMs: 1 }
    )
  ).rejects.toMatchObject({ code: "PARSE_FAILED" });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- tests/product-preview.test.ts
```

Expected: FAIL because `redMartTimeoutMs` is not accepted and the production route still supplies `deferRedMartToScheduledRefresh`.

- [ ] **Step 3: Implement the bounded preview and remove unconditional deferral**

In `src/lib/products/preview.ts`, replace the obsolete dependency flag with:

```ts
redMartTimeoutMs?: number;
```

Replace the RedMart branch with:

```ts
if (supportedUrl.retailerSlug === "redmart") {
  try {
    return buildProductPreview(
      await withTimeout(
        scrapeRedMart(supportedUrl.canonicalUrl),
        dependencies.redMartTimeoutMs ?? 50_000
      ),
      supportedUrl
    );
  } catch (error) {
    logPreviewFailure(supportedUrl, "scrape", error);
    if (error instanceof ProductPreviewError) {
      throw error;
    }
    throw new ProductPreviewError("PARSE_FAILED");
  }
}
```

Add the bounded helper near the existing normalization helpers:

```ts
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("PREVIEW_TIMEOUT")),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
```

Change `logPreviewFailure` to log `errorCategory: classifyPreviewFailure(error)` instead of the raw error message, and add:

```ts
function classifyPreviewFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "PREVIEW_TIMEOUT") return "TIMEOUT";
  if (/\b(?:403|429)\b|captcha|access denied|blocked|bot protection/i.test(message)) {
    return "BLOCKED";
  }
  return "FAILED";
}
```

In `src/app/api/products/preview/route.ts`, add:

```ts
export const maxDuration = 60;
```

and replace the preview call with:

```ts
return NextResponse.json(await previewProductUrl(payload.data.url));
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- tests/product-preview.test.ts
```

Expected: all product preview tests pass.

- [ ] **Step 5: Run adjacent preview, wizard, parser, and workflow tests**

Run:

```bash
npm test -- tests/product-preview.test.ts tests/product-wizard.test.tsx tests/redmart-browser-page.test.ts tests/redmart-product-page.test.ts tests/scheduled-workflow.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/app/api/products/preview/route.ts src/lib/products/preview.ts tests/product-preview.test.ts
git commit -m "fix: restore immediate RedMart previews"
```

### Task 3: Verify, Push, Deploy, and Retest Production

**Files:**
- Verify: `.github/workflows/scheduled-scrape.yml`
- Verify: `prisma/schema.prisma`
- No planned source edits.

**Interfaces:**
- Consumes: tested `main` branch and existing Vercel Git integration.
- Produces: `origin/main` as the deployment source and live automatic RedMart previews.

- [ ] **Step 1: Run the required repository verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/grocery?schema=public' DIRECT_URL='postgresql://postgres:postgres@localhost:5432/grocery?schema=public' npx prisma validate
```

Expected: all commands exit zero.

- [ ] **Step 2: Confirm the scheduled workflow is enabled on `main`**

Run:

```bash
git show main:.github/workflows/scheduled-scrape.yml
```

Expected: active cron entries at `0 4 * * *` and `0 16 * * *`, Chromium installation, and `npm run scrape`.

- [ ] **Step 3: Push `main`**

Run:

```bash
git push origin main
```

Expected: `origin/main` advances to the verified implementation commit.

- [ ] **Step 4: Wait for the matching Vercel production deployment**

Use the existing Vercel project UI or CLI to verify the production deployment commit equals `git rev-parse main` and reaches Ready state.

- [ ] **Step 5: Retest both supplied RedMart URLs**

Through the authenticated production `/products/new` UI, submit:

```text
https://www.lazada.sg/products/pdp-i3646264233-s24103165302.html?price=12.96&stock=1
https://www.lazada.sg/products/pdp-i303316841-s536686006.html?price=13.95&stock=1
```

Expected: automatic previews identify Bulla Creamy Classic Vanilla 2L at `$12.96` and The Ice Cream & Cookie Co. Mint Chocolate Artisanal Gelato 473 ml at `$13.95`, without manual identity entry.

- [ ] **Step 6: Retest the existing Ben & Jerry's listing**

Open:

```text
https://singapore-grocery-price-tracker.vercel.app/products/ben-jerry-s-strawberry-cheesecake-ice-cream-pint-458ml
```

Run Refresh Prices and verify RedMart either appears with a valid snapshot or the application records and reports a specific blocked/failed attempt. Do not add bypass logic if Lazada returns bot protection.

- [ ] **Step 7: Report deployment evidence**

Record the final commit SHA, pushed branch, Vercel deployment state, required verification results, both preview results, and the Ben & Jerry's RedMart refresh result.
