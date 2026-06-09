// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshWeeklyDealsButton } from "@/app/deals/refresh-weekly-deals-button";

vi.mock("@/app/full-page-loading-overlay", () => ({
  FullPageLoadingOverlay: ({ message }: { message: string }) => (
    <div role="status">{message}</div>
  )
}));

describe("RefreshWeeklyDealsButton", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports the dated flyer refresh result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            publicationsDiscovered: 4,
            publicationsSkipped: 2,
            staleDealsRemoved: 24,
            flyersFetched: 4,
            candidatesCreated: 6,
            parseFailures: 0,
            failures: []
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    render(<RefreshWeeklyDealsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh weekly deals" }));

    expect(screen.getByRole("status")).toHaveTextContent("Refreshing weekly flyer deals...");
    expect(
      await screen.findByText(
        "24 stale deals removed, 4 flyer pages imported, 6 review candidates, 2 unchanged publications skipped."
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows a useful error and clears the overlay for a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    render(<RefreshWeeklyDealsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh weekly deals" }));

    expect(await screen.findByText("Weekly deals refresh failed. Try again in a moment.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a useful error and clears the overlay when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    render(<RefreshWeeklyDealsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh weekly deals" }));

    expect(await screen.findByText("Weekly deals refresh failed. Try again in a moment.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports partial refresh failures without navigating away", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            publicationsDiscovered: 4,
            publicationsSkipped: 1,
            staleDealsRemoved: 12,
            flyersFetched: 2,
            candidatesCreated: 3,
            parseFailures: 1,
            failures: [
              {
                seriesKey: "cold-storage-grocery-selections",
                message: "No trustworthy deal cards found"
              }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    render(<RefreshWeeklyDealsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh weekly deals" }));

    expect(
      await screen.findByText(
        "12 stale deals removed, 2 flyer pages imported, 3 review candidates, 1 unchanged publication skipped. 1 flyer failed to refresh; stale deals may have been cleared."
      )
    ).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
