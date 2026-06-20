import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { requireSameOrigin } from "@/lib/auth/request-security";

const MUTATION_ROUTES = [
  "src/app/api/admin/redmart/refresh/route.ts",
  "src/app/api/prices/refresh/route.ts",
  "src/app/api/products/[id]/listings/route.ts",
  "src/app/api/products/[id]/route.ts",
  "src/app/api/products/preview/route.ts",
  "src/app/api/products/route.ts",
  "src/app/api/redmart/refresh/route.ts",
  "src/app/api/scrape-runs/route.ts",
  "src/app/auth/signout/route.ts"
];

const COLLECTOR_MUTATION_ROUTES = [
  "src/app/api/collector/redmart/jobs/[id]/result/route.ts",
  "src/app/api/collector/redmart/jobs/claim/route.ts",
];

describe("same-origin mutation protection", () => {
  it("enumerates every current state-changing Route Handler", () => {
    const discovered = listFiles("src/app")
      .filter((path) => path.endsWith("/route.ts"))
      .filter((path) =>
        /export async function (?:POST|PUT|PATCH|DELETE)\b/.test(
          readFileSync(path, "utf8")
        )
      );

    expect(discovered).toEqual(
      [...MUTATION_ROUTES, ...COLLECTOR_MUTATION_ROUTES].sort(),
    );
  });

  it.each([
    { name: "missing", origin: undefined },
    { name: "foreign", origin: "https://attacker.example" }
  ])("rejects a $name Origin", async ({ origin }) => {
    const request = new Request("https://prices.example/api/mutation", {
      method: "POST",
      headers: origin ? { Origin: origin } : undefined
    });

    const response = requireSameOrigin(
      request,
      "https://prices.example"
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Forbidden"
    });
  });

  it("allows the configured canonical Origin", () => {
    const request = new Request("https://internal.invalid/api/mutation", {
      method: "POST",
      headers: { Origin: "https://prices.example" }
    });

    expect(
      requireSameOrigin(request, "https://prices.example")
    ).toBeNull();
  });

  it.each(MUTATION_ROUTES)(
    "%s explicitly validates each mutation method",
    (path) => {
      const source = readFileSync(path, "utf8");
      const mutations =
        source.match(
          /export async function (?:POST|PUT|PATCH|DELETE)\b/g
        ) ?? [];
      const checks =
        source.match(/\brequireSameOrigin\(request\)/g) ?? [];

      expect(mutations.length).toBeGreaterThan(0);
      expect(checks).toHaveLength(mutations.length);
      const starts = [
        ...source.matchAll(
          /export async function (?:POST|PUT|PATCH|DELETE)\b/g
        )
      ].map((match) => match.index);
      starts.forEach((start, index) => {
        const body = source.slice(
          start,
          starts[index + 1] ?? source.length
        );
        const originCheck = body.indexOf("requireSameOrigin(request)");
        const authBoundary = Math.max(
          body.indexOf("await requireAppSession()"),
          body.indexOf("await requireAdminSession()"),
          body.indexOf("createSupabaseServerClient()")
        );
        expect(originCheck).toBeGreaterThanOrEqual(0);
        expect(originCheck).toBeLessThan(authBoundary);
      });
    }
  );

  it.each(COLLECTOR_MUTATION_ROUTES)(
    "%s uses bearer authentication instead of session cookies",
    (path) => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("isCollectorAuthorized(request");
      expect(source).not.toContain("requireAppSession");
      expect(source).not.toContain("requireSameOrigin");
    },
  );
});

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    })
    .map((path) => relative(".", path))
    .sort();
}
