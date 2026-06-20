import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAuthServerEnv, parseRedMartServerEnv } from "@/lib/env";
import { getSupabaseAdminConfig } from "@/lib/supabase/admin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server environment", () => {
  it("normalizes RedMart admin emails and requires a strong collector token", () => {
    expect(
      parseRedMartServerEnv({
        ADMIN_EMAILS:
          " KimberlyPhuaWeyHan@gmail.com,admin@example.com,ADMIN@example.com ",
        REDMART_COLLECTOR_TOKEN: "x".repeat(32),
      }),
    ).toEqual({
      adminEmails: [
        "kimberlyphuaweyhan@gmail.com",
        "admin@example.com",
      ],
      collectorToken: "x".repeat(32),
    });

    expect(() =>
      parseRedMartServerEnv({
        ADMIN_EMAILS: "not-an-email",
        REDMART_COLLECTOR_TOKEN: "short",
      }),
    ).toThrow();
  });

  it("requires Supabase auth settings", () => {
    expect(() => parseAuthServerEnv({})).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL"
    );
    expect(
      parseAuthServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: "https://prices.example"
      })
    ).toMatchObject({
      appOrigin: "https://prices.example"
    });
  });

  it.each([
    "https://prices.example/path",
    "https://prices.example?query=1",
    "https://prices.example#fragment",
    "ftp://prices.example"
  ])("rejects a non-canonical APP_ORIGIN: %s", (appOrigin) => {
    expect(() =>
      parseAuthServerEnv({
        NEXT_PUBLIC_SUPABASE_URL:
          "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: appOrigin
      })
    ).toThrow("APP_ORIGIN");
  });

  it("allows an HTTP localhost APP_ORIGIN for development", () => {
    expect(
      parseAuthServerEnv({
        NEXT_PUBLIC_SUPABASE_URL:
          "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: "http://localhost:3000"
      }).appOrigin
    ).toBe("http://localhost:3000");
  });

  it.each(["ftp://example.com", "javascript:alert(1)"])(
    "rejects a non-http Supabase URL: %s",
    (supabaseUrl) => {
      expect(() =>
        parseAuthServerEnv({
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
          APP_ORIGIN: "https://prices.example"
        })
      ).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    }
  );

  it("reports malformed Supabase URLs as structured validation errors", () => {
    expect(() =>
      parseAuthServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: "https://prices.example"
      })
    ).toThrow(z.ZodError);
  });

  it("uses the scheduled upload bucket when no flyer bucket override is set", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "https://axmooodckwmazabgitkv.supabase.co"
    );
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    vi.stubEnv("SUPABASE_FLYER_BUCKET", "");
    delete process.env.SUPABASE_FLYER_BUCKET;

    expect(getSupabaseAdminConfig().flyerBucket).toBe("promotion-flyers");
  });
});
