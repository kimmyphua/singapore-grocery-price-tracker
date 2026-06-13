// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductWizard } from "@/app/products/new/product-wizard";
import { ProductActions } from "@/app/products/[slug]/product-actions";

const preview = {
  retailerSlug: "fairprice",
  canonicalUrl: "https://www.fairprice.com.sg/product/13142563",
  retailerSku: "13142563",
  titleRaw: "Example Milk 1L",
  name: "Example Milk 1L",
  brand: "Example",
  family: "Unknown",
  flavour: null,
  packCount: 1,
  unitSize: 1,
  unit: "l",
  totalSize: 1,
  imageUrl: null,
  price: 4.5,
  originalPrice: null,
  promotionText: null,
  isAvailable: true
};

describe("ProductWizard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews a URL, allows edits, and confirms the product", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preview), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "product-1" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductWizard />);
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: preview.canonicalUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));

    expect(await screen.findByLabelText("Product name")).toHaveValue(
      "Example Milk 1L"
    );
    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "My coffee milk" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/products",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("My coffee milk")
        })
      );
    });
    expect(await screen.findByText("Product saved.")).toBeInTheDocument();
  });

  it("shows a supported error and keeps the entered URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: "UNSUPPORTED_URL" }), {
          status: 422,
          headers: { "content-type": "application/json" }
        })
      )
    );

    render(<ProductWizard />);
    const input = screen.getByLabelText("Product URL");
    fireEvent.change(input, {
      target: { value: "https://example.com/product/1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));

    expect(
      await screen.findByText(
        "That URL is not a supported FairPrice, Cold Storage, or RedMart product page."
      )
    ).toBeInTheDocument();
    expect(input).toHaveValue("https://example.com/product/1");
  });
});

describe("ProductActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires confirmation before deleting a product", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProductActions productId="product-1" productSlug="milk" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
    expect(fetchMock).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products/product-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
