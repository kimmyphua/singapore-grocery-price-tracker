// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductWizard } from "@/app/products/new/product-wizard";
import { ProductActions } from "@/app/products/[slug]/product-actions";
import { ListingActions } from "@/app/products/[slug]/listing-actions";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock })
}));

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
    cleanup();
    pushMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("saves one URL and only then offers to add another retailer", async () => {
    const secondPreview = {
      ...preview,
      retailerSlug: "cold-storage",
      canonicalUrl: "https://coldstorage.com.sg/product/example-milk-1l",
      retailerSku: "cold-1",
      price: 4.7
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(preview), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "product-1", slug: "my-coffee-milk" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(Response.json(secondPreview))
      .mockResolvedValueOnce(
        Response.json({ attached: true }, { status: 201 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductWizard />);
    expect(
      screen.queryByRole("button", { name: "Add another retailer" })
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: "Add another retailer" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View product" })
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Add another retailer" })
    );
    expect(screen.getByLabelText("Product URL")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: secondPreview.canonicalUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));
    await screen.findByText("Current price:", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Add retailer" }));

    await screen.findByText("Retailer added.");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products/product-1/listings",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(secondPreview.canonicalUrl)
      })
    );
  });

  it("warns about a different product and saves only after explicit confirmation", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: "IDENTITY_MISMATCH",
            conflicts: [{ field: "unitSize" }]
          },
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(Response.json({ attached: true }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductWizard productId="product-1" productSlug="example-milk" />
    );
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: preview.canonicalUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));
    await screen.findByLabelText("Product name");
    fireEvent.click(screen.getByRole("button", { name: "Add retailer" }));

    expect(
      await screen.findByText(
        /may be named or sized differently from the saved product/
      )
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add retailer anyway" })
    );

    await screen.findByText("Retailer added.");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products/product-1/listings",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"allowIdentityMismatch":true')
      })
    );
  });

  it("queues a blocked Lazada listing for scheduled refresh without asking for a price", async () => {
    const lazadaUrl =
      "https://www.lazada.sg/products/pdp-i301118872-s527230478.html";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "PARSE_FAILED" }, { status: 422 })
      )
      .mockResolvedValueOnce(Response.json({ attached: true }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductWizard
        productId="product-1"
        productSlug="example-milk"
        existingProduct={{
          name: preview.name,
          brand: preview.brand,
          family: preview.family,
          flavour: preview.flavour,
          packCount: preview.packCount,
          unitSize: preview.unitSize,
          unit: preview.unit,
          totalSize: preview.totalSize,
          imageUrl: preview.imageUrl
        }}
      />
    );
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: lazadaUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));

    expect(
      await screen.findByText(/verified price and promotion will be added/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Current price")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add retailer for scheduled refresh" })
    );

    await screen.findByText("Retailer added.");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products/product-1/listings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: lazadaUrl, pending: true })
      })
    );
  });

  it("allows manual details for a supported new-product URL that cannot be fetched", async () => {
    const shengSiongUrl =
      "https://shengsiong.com.sg/product/tasty-bites-fish-bean-curd-240-g";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: "PARSE_FAILED" }, { status: 422 })
      )
      .mockResolvedValueOnce(
        Response.json(
          { id: "product-2", slug: "tasty-bites-fish-bean-curd" },
          { status: 201 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductWizard />);
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: shengSiongUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));

    expect(
      await screen.findByText(/Automatic extraction was unavailable/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "Tasty Bites Fish Bean Curd 240g" }
    });
    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "Tasty Bites" }
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Frozen food" }
    });
    fireEvent.change(screen.getByLabelText("Pack count"), {
      target: { value: "1" }
    });
    fireEvent.change(screen.getByLabelText("Unit size"), {
      target: { value: "240" }
    });
    fireEvent.change(screen.getByLabelText("Unit"), {
      target: { value: "g" }
    });
    fireEvent.change(screen.getByLabelText("Total size"), {
      target: { value: "240" }
    });
    fireEvent.change(screen.getByLabelText("Current price"), {
      target: { value: "4.65" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await screen.findByText("Product saved.");
  });

  it("does not queue a failed non-RedMart URL without identity confirmation", async () => {
    const shengSiongUrl =
      "https://shengsiong.com.sg/product/tasty-bites-fish-bean-curd-240-g";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ error: "PARSE_FAILED" }, { status: 422 })
      )
    );

    render(
      <ProductWizard
        productId="product-1"
        productSlug="example-milk"
        existingProduct={{
          name: preview.name,
          brand: preview.brand,
          family: preview.family,
          flavour: preview.flavour,
          packCount: preview.packCount,
          unitSize: preview.unitSize,
          unit: preview.unit,
          totalSize: preview.totalSize,
          imageUrl: preview.imageUrl
        }}
      />
    );
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: shengSiongUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));

    expect(await screen.findByLabelText("Current price")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Add retailer for scheduled refresh"
      })
    ).not.toBeInTheDocument();
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
        "That URL is not a supported supermarket product page."
      )
    ).toBeInTheDocument();
    expect(input).toHaveValue("https://example.com/product/1");
  });

  it("shows a clear duplicate product error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(
        Response.json({ error: "DUPLICATE_PRODUCT" }, { status: 409 })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProductWizard />);
    fireEvent.change(screen.getByLabelText("Product URL"), {
      target: { value: preview.canonicalUrl }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview product" }));
    await screen.findByLabelText("Product name");
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    expect(
      await screen.findByText(
        "You are already tracking this product. Open it from Products to add another retailer."
      )
    ).toBeInTheDocument();
  });
});

describe("ProductActions", () => {
  afterEach(() => {
    cleanup();
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

describe("ListingActions", () => {
  afterEach(() => {
    cleanup();
    refreshMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("removes one retailer listing and refreshes the product page", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detached: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ListingActions
        productId="product-1"
        retailerId="retailer-redmart"
        retailerName="RedMart"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove RedMart URL" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products/product-1/listings",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ retailerId: "retailer-redmart" })
        })
      );
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
