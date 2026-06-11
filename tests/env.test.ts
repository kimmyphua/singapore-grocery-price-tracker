import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

describe("server environment", () => {
  it("requires Supabase auth and legacy owner settings", () => {
    expect(() => parseServerEnv({})).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://axmooodckwmazabgitkv.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        LEGACY_OWNER_EMAIL: "owner@example.com"
      })
    ).toMatchObject({ legacyOwnerEmail: "owner@example.com" });
  });
});
