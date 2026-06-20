import { describe, expect, it } from "vitest";
import { isAdminEmail } from "@/lib/auth/admin";

describe("admin authorization", () => {
  it("matches allowlisted emails case-insensitively", () => {
    expect(
      isAdminEmail("KimberlyPhuaWeyHan@gmail.com", [
        "kimberlyphuaweyhan@gmail.com",
      ]),
    ).toBe(true);
  });

  it("rejects users outside the allowlist", () => {
    expect(
      isAdminEmail("other@example.com", [
        "kimberlyphuaweyhan@gmail.com",
      ]),
    ).toBe(false);
  });
});
