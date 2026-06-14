// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationFeedback } from "@/app/navigation-feedback";

let pathname = "/products";
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams
}));

describe("NavigationFeedback", () => {
  afterEach(() => {
    cleanup();
    pathname = "/products";
    searchParams = new URLSearchParams();
  });

  it("shows immediately for internal link navigation and clears on arrival", () => {
    const { rerender } = render(
      <>
        <NavigationFeedback />
        <a href="/products/example/edit" onClick={(event) => event.preventDefault()}>
          Add retailer URL
        </a>
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Add retailer URL" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");

    pathname = "/products/example/edit";
    rerender(
      <>
        <NavigationFeedback />
        <a href="/products/example/edit" onClick={(event) => event.preventDefault()}>
          Add retailer URL
        </a>
      </>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears after query-string navigation completes", () => {
    const { rerender } = render(
      <>
        <NavigationFeedback />
        <a href="/products?historyPage=2" onClick={(event) => event.preventDefault()}>
          Next
        </a>
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "Next" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    searchParams = new URLSearchParams("historyPage=2");
    rerender(
      <>
        <NavigationFeedback />
        <a href="/products?historyPage=2" onClick={(event) => event.preventDefault()}>
          Next
        </a>
      </>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores external and new-tab links", () => {
    render(
      <>
        <NavigationFeedback />
        <a href="https://example.com" onClick={(event) => event.preventDefault()}>
          External
        </a>
        <a href="/flyers" target="_blank" onClick={(event) => event.preventDefault()}>
          New tab
        </a>
      </>
    );

    fireEvent.click(screen.getByRole("link", { name: "External" }));
    fireEvent.click(screen.getByRole("link", { name: "New tab" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
