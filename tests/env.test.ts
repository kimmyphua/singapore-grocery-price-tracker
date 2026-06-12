import { z } from "zod";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

describe("server environment", () => {
  it("requires Supabase auth and legacy owner settings", () => {
    expect(() => parseServerEnv({})).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: "https://prices.example",
        LEGACY_OWNER_EMAIL: "owner@example.com"
      })
    ).toMatchObject({
      appOrigin: "https://prices.example",
      legacyOwnerEmail: "owner@example.com"
    });
  });

  it.each([
    "https://prices.example/path",
    "https://prices.example?query=1",
    "https://prices.example#fragment",
    "ftp://prices.example"
  ])("rejects a non-canonical APP_ORIGIN: %s", (appOrigin) => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL:
          "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: appOrigin,
        LEGACY_OWNER_EMAIL: "owner@example.com"
      })
    ).toThrow("APP_ORIGIN");
  });

  it("allows an HTTP localhost APP_ORIGIN for development", () => {
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL:
          "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: "http://localhost:3000",
        LEGACY_OWNER_EMAIL: "owner@example.com"
      }).appOrigin
    ).toBe("http://localhost:3000");
  });

  it.each(["ftp://example.com", "javascript:alert(1)"])(
    "rejects a non-http Supabase URL: %s",
    (supabaseUrl) => {
      expect(() =>
        parseServerEnv({
          NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
          APP_ORIGIN: "https://prices.example",
          LEGACY_OWNER_EMAIL: "owner@example.com"
        })
      ).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    }
  );

  it("reports malformed Supabase URLs as structured validation errors", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        APP_ORIGIN: "https://prices.example",
        LEGACY_OWNER_EMAIL: "owner@example.com"
      })
    ).toThrow(z.ZodError);
  });
});
