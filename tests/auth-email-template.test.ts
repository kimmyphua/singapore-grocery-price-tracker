import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Supabase magic-link email template", () => {
  it("documents the cross-browser token-hash callback shape", () => {
    const documentation = readFileSync(
      "docs/supabase-magic-link-template.md",
      "utf8"
    );

    expect(documentation).toContain("{{ .RedirectTo }}");
    expect(documentation).toContain("token_hash={{ .TokenHash }}");
    expect(documentation).toContain("type=email");
    expect(documentation).toContain("verifyOtp");
    expect(documentation).not.toContain("?code=");
  });
});
