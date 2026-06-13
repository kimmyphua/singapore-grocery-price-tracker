import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/scheduled-scrape.yml",
  "utf8"
);
const readme = readFileSync("README.md", "utf8");

describe("scheduled scrape workflow", () => {
  it("runs at midnight and noon Singapore time", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "0 4 * * *"');
    expect(workflow).toContain('cron: "0 16 * * *"');
  });

  it("installs Chromium and runs the shared scheduled refresh", () => {
    expect(workflow).toContain("DIRECT_URL: ${{ secrets.DIRECT_URL }}");
    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}"
    );
    expect(workflow).toContain(
      "SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}"
    );
    expect(workflow).toContain(
      "SUPABASE_FLYER_BUCKET: ${{ secrets.SUPABASE_FLYER_BUCKET }}"
    );
    expect(workflow).toContain(
      "npx playwright install --with-deps chromium"
    );
    expect(workflow).toContain("npm run scrape");
  });

  it("documents every required repository secret", () => {
    expect(readme).toContain("`DATABASE_URL`");
    expect(readme).toContain("`DIRECT_URL`");
    expect(readme).toContain("`SCRAPER_USER_AGENT`");
    expect(readme).toContain("`NEXT_PUBLIC_SUPABASE_URL`");
    expect(readme).toContain("`SUPABASE_SECRET_KEY`");
    expect(readme).toContain("`SUPABASE_FLYER_BUCKET`");
  });
});
