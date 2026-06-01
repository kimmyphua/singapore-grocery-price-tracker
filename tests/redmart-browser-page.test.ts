import { describe, expect, it, vi } from "vitest";
import { prepareRedMartProductPageForExtraction } from "@/lib/scraping/redmart-browser-page";

describe("RedMart browser page scraper", () => {
  it("scrolls after initial load so lazy promotion modules can emit multibuy responses", async () => {
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const wheel = vi.fn().mockResolvedValue(undefined);
    const innerText = vi.fn().mockResolvedValue("Any 3 Save $13.85");

    await prepareRedMartProductPageForExtraction({
      waitForLoadState,
      waitForTimeout,
      mouse: { wheel },
      locator: () => ({ innerText })
    });

    expect(waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 15000 });
    expect(waitForTimeout).toHaveBeenNthCalledWith(1, 1500);
    expect(wheel).toHaveBeenCalledWith(0, 1200);
    expect(waitForTimeout).toHaveBeenNthCalledWith(2, 4500);
  });

  it("polls rendered text until RedMart promotions are visible", async () => {
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const waitForTimeout = vi.fn().mockResolvedValue(undefined);
    const wheel = vi.fn().mockResolvedValue(undefined);
    const innerText = vi
      .fn()
      .mockResolvedValueOnce("Magnum Mini Almond\n$12.12")
      .mockResolvedValueOnce("Promotions\nAny 3 Save $13.85");

    await prepareRedMartProductPageForExtraction({
      waitForLoadState,
      waitForTimeout,
      mouse: { wheel },
      locator: () => ({ innerText })
    });

    expect(innerText).toHaveBeenCalledTimes(2);
    expect(waitForTimeout).toHaveBeenCalledWith(1000);
  });
});
