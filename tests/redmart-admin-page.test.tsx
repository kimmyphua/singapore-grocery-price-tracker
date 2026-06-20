import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/admin/redmart/page.tsx", "utf8");
const actions = readFileSync(
  "src/app/admin/redmart/redmart-admin-actions.tsx",
  "utf8",
);

describe("RedMart admin dashboard", () => {
  it("guards the page before listing jobs", () => {
    expect(page.indexOf("requireAdminPage()"))
      .toBeLessThan(page.indexOf("await listRedMartRefreshJobs"));
  });

  it("explains the manual collector boundary and exposes queue controls", () => {
    expect(page).toContain("RedMart refresh queue");
    expect(page).toContain("npm run redmart:refresh");
    expect(page).toContain("This page queues work");
    expect(actions).toContain("Queue all tracked RedMart");
    expect(actions).toContain('action: "retry"');
  });

  it("never places the collector token in dashboard code", () => {
    expect(page).not.toContain("REDMART_COLLECTOR_TOKEN");
    expect(actions).not.toContain("REDMART_COLLECTOR_TOKEN");
  });
});
