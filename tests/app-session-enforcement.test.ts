import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, requireAppSessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  requireAppSessionMock: vi.fn()
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: redirectMock
  };
});

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireAppSession: requireAppSessionMock
  };
});

import DashboardPage from "@/app/page";
import { GET as getProducts } from "@/app/api/products/route";
import { AuthSessionError } from "@/lib/auth/session";

const PROTECTED_PAGES = [
  "src/app/account/page.tsx",
  "src/app/admin/matches/page.tsx",
  "src/app/admin/promotions/page.tsx",
  "src/app/deals/page.tsx",
  "src/app/page.tsx",
  "src/app/products/[slug]/edit/page.tsx",
  "src/app/products/[slug]/page.tsx",
  "src/app/products/new/page.tsx",
  "src/app/products/page.tsx"
];

const PROTECTED_ROUTE_HANDLERS = [
  "src/app/api/prices/latest/route.ts",
  "src/app/api/prices/refresh/route.ts",
  "src/app/api/products/[id]/listings/route.ts",
  "src/app/api/products/[id]/route.ts",
  "src/app/api/products/preview/route.ts",
  "src/app/api/products/route.ts",
  "src/app/api/promotions/deals/[id]/route.ts",
  "src/app/api/promotions/deals/bulk/route.ts",
  "src/app/api/promotions/refresh/route.ts",
  "src/app/api/scrape-runs/route.ts"
];

describe("protected server entry point coverage", () => {
  it("enumerates every current protected page and Route Handler", () => {
    const appFiles = listFiles("src/app");
    const pages = appFiles
      .filter((path) => path.endsWith("/page.tsx"))
      .filter((path) => path !== "src/app/login/page.tsx")
      .filter((path) => !path.startsWith("src/app/auth/"));
    const routeHandlers = appFiles
      .filter((path) => path.endsWith("/route.ts"))
      .filter((path) => !path.startsWith("src/app/auth/"));

    expect(pages).toEqual(PROTECTED_PAGES);
    expect(routeHandlers).toEqual(PROTECTED_ROUTE_HANDLERS);
  });

  it.each(PROTECTED_PAGES)("%s invokes the protected page guard", (path) => {
    const source = readFileSync(path, "utf8");

    expect(source).toContain("requireProtectedPage()");
  });

  it.each(PROTECTED_ROUTE_HANDLERS)(
    "%s explicitly checks every exported handler",
    (path) => {
      const source = readFileSync(path, "utf8");
      const exportedHandlers =
        source.match(
          /export async function (?:GET|POST|PUT|PATCH|DELETE)\b/g
        ) ?? [];
      const appSessionChecks =
        source.match(/\bawait requireAppSession\(\)/g) ?? [];

      expect(exportedHandlers.length).toBeGreaterThan(0);
      expect(appSessionChecks).toHaveLength(exportedHandlers.length);
    }
  );
});

describe("AppSession enforcement behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects an expired AppSession away from the dashboard", async () => {
    requireAppSessionMock.mockRejectedValue(
      new AuthSessionError(
        "SESSION_EXPIRED",
        "The application session has expired."
      )
    );

    await expect(DashboardPage()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/session-expired"
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/auth/session-expired"
    );
  });

  it("returns 401 JSON for an expired AppSession on /api/products", async () => {
    requireAppSessionMock.mockRejectedValue(
      new AuthSessionError(
        "SESSION_EXPIRED",
        "The application session has expired."
      )
    );

    const response = await getProducts();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized"
    });
  });

  it("does not turn page provider failures into login redirects", async () => {
    requireAppSessionMock.mockRejectedValue(
      new AuthSessionError(
        "SESSION_PROVIDER_ERROR",
        "The authentication provider is temporarily unavailable.",
        { name: "AuthRetryableFetchError", status: 503 }
      )
    );

    await expect(DashboardPage()).rejects.toMatchObject({
      code: "SESSION_PROVIDER_ERROR"
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns a service error instead of 401 for API provider failures", async () => {
    requireAppSessionMock.mockRejectedValue(
      new AuthSessionError(
        "SESSION_PROVIDER_ERROR",
        "The authentication provider is temporarily unavailable.",
        { name: "AuthRetryableFetchError", status: 503 }
      )
    );

    const response = await getProducts();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication service unavailable"
    });
  });
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
