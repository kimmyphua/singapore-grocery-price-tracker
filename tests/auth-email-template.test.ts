import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Supabase magic-link email template", () => {
  it("documents both default and cross-browser callback options", () => {
    const documentation = readFileSync(
      "docs/supabase-magic-link-template.md",
      "utf8"
    );

    expect(documentation).toContain("default Supabase template");
    expect(documentation).toContain("exchangeCodeForSession");
    expect(documentation).toContain("{{ .RedirectTo }}");
    expect(documentation).toContain("token_hash={{ .TokenHash }}");
    expect(documentation).toContain("type=email");
    expect(documentation).toContain("verifyOtp");
  });
});
