import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("removed promotion workflow", () => {
  it("removes deals, promotion review, and promotion APIs", () => {
    expect(existsSync("src/app/deals")).toBe(false);
    expect(existsSync("src/app/admin/promotions")).toBe(false);
    expect(existsSync("src/app/api/promotions")).toBe(false);
    expect(existsSync("src/lib/promotions")).toBe(false);
  });

  it("keeps navigation focused on products and flyers", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).not.toContain('href="/deals"');
    expect(layout).not.toContain('href="/admin/promotions"');
    expect(layout).toContain('href="/flyers"');
  });

  it("has no active source imports of obsolete promotion models", () => {
    const source = listFiles("src")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bPromotion(?:Deal|Flyer)\b/);
  });
});

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const file = path.join(root, entry);
    return statSync(file).isDirectory() ? listFiles(file) : [file];
  });
}
