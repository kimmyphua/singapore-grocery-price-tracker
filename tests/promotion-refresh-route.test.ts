import { describe, expect, it } from "vitest";
import { preferredRegion } from "@/app/api/promotions/refresh/route";

describe("promotion refresh route", () => {
  it("runs near the Tokyo Supabase database", () => {
    expect(preferredRegion).toBe("hnd1");
  });
});
