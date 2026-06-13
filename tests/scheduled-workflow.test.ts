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
      "npx playwright install --with-deps chromium"
    );
    expect(workflow).toContain("npm run scrape");
  });

  it("documents every required repository secret", () => {
    expect(readme).toContain("`DATABASE_URL`");
    expect(readme).toContain("`DIRECT_URL`");
    expect(readme).toContain("`SCRAPER_USER_AGENT`");
  });
});
