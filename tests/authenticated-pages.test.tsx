import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OWNER_SCOPED_PAGES = [
  "src/app/page.tsx",
  "src/app/products/page.tsx",
  "src/app/products/[slug]/page.tsx",
  "src/app/account/page.tsx"
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

    expect(source).toContain('href="/"');
    expect(source).toContain('href="/products"');
    expect(source).toContain('href="/account"');
    expect(source).toContain('action="/auth/signout"');
  });
});
