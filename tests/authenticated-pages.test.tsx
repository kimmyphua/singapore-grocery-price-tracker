import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OWNER_SCOPED_PAGES = [
  "src/app/page.tsx",
  "src/app/products/page.tsx",
  "src/app/products/[slug]/page.tsx",
  "src/app/account/page.tsx"
];

const INTERNAL_NAVIGATION_FILES = [
  "src/app/page.tsx",
  "src/app/products/page.tsx",
  "src/app/products/new/page.tsx",
  "src/app/products/[slug]/page.tsx",
  "src/app/products/[slug]/edit/page.tsx",
  "src/app/products/[slug]/product-actions.tsx",
  "src/app/flyers/page.tsx",
  "src/app/flyers/[id]/page.tsx"
];

describe("authenticated private pages", () => {
  it.each(OWNER_SCOPED_PAGES)(
    "%s loads the authenticated profile at the server boundary",
    (path) => {
      const source = readFileSync(path, "utf8");

      expect(source).toContain("requireProtectedPage()");
      expect(source).toContain("profileId");
    }
  );

  it("uses owner product queries instead of the hardcoded product basket", () => {
    for (const path of OWNER_SCOPED_PAGES.slice(0, 3)) {
      const source = readFileSync(path, "utf8");

      expect(source).toContain("getTrackedProductRows");
      expect(source).not.toMatch(
        /import\s+\{[^}]*products[^}]*\}\s+from\s+"@\/lib\/data\/seed-data"/
      );
    }
  });

  it("offers signed-in navigation and local sign out", () => {
    const source = readFileSync("src/app/layout.tsx", "utf8");

    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain('href="/"');
    expect(source).toContain('href="/products"');
    expect(source).toContain('href="/account"');
    expect(source).toContain('action="/auth/signout"');
    expect(source).not.toMatch(/<a href="\/(?:products|flyers|account)?"/);
  });

  it("keeps the footer at the viewport bottom and shows route loading feedback", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const loading = readFileSync("src/app/loading.tsx", "utf8");

    expect(layout).toContain("flex min-h-screen flex-col");
    expect(layout).toContain("<main");
    expect(layout).toContain("flex-1");
    expect(loading).toContain('role="status"');
    expect(loading).toContain("animate-spin");
  });

  it("does not repeat the remote session lookup in the root layout", () => {
    const source = readFileSync("src/app/layout.tsx", "utf8");

    expect(source).toContain('import { cookies } from "next/headers"');
    expect(source).toContain("isSupabaseAuthCookie");
    expect(source).not.toContain("requireAppSession");
  });

  it("loads product detail snapshots once and derives both price views locally", () => {
    const source = readFileSync("src/app/products/[slug]/page.tsx", "utf8");

    expect(source.match(/getTrackedProductRows\(/g)).toHaveLength(1);
    expect(source).toContain("getCachedLatestPricesFromRows");
    expect(source).toContain("getCachedWeeklyPriceHistoryFromRows");
  });

  it("queues RedMart separately and shows its latest refresh state", () => {
    const query = readFileSync("src/lib/products/queries.ts", "utf8");
    const page = readFileSync("src/app/products/[slug]/page.tsx", "utf8");
    const refreshRoute = readFileSync(
      "src/app/api/prices/refresh/route.ts",
      "utf8",
    );
    const refreshService = readFileSync(
      "src/lib/pricing/refresh-prices.ts",
      "utf8",
    );

    expect(query).toContain("redMartRefreshJobs");
    expect(refreshRoute).toContain("queueOwnerRedMartRefreshes");
    expect(refreshService).toContain('slug: { not: "redmart" }');
    expect(page).toContain("Waiting for RedMart refresh");
    expect(page).toContain("RedMart refresh in progress");
    expect(page).toContain("RedMart refresh failed");
    expect(page).toContain("RedMart verified");
  });

  it("runs server functions in Singapore near the database and retailers", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));

    expect(config.regions).toEqual(["sin1"]);
  });

  it("keeps serverless browser dependencies out of the Next.js webpack bundle", () => {
    const config = readFileSync("next.config.js", "utf8");

    expect(config).toContain('"@sparticuz/chromium"');
    expect(config).toContain('"playwright-core"');
    expect(config).toContain("serverComponentsExternalPackages");
  });

  it.each(INTERNAL_NAVIGATION_FILES)(
    "%s uses client navigation for application links",
    (path) => {
      const source = readFileSync(path, "utf8");

      expect(source).not.toMatch(
        /<a[\s\S]{0,160}?href=(?:"\/(?!api\/)|\{`\/(?!api\/))/
      );
    }
  );
});
