import { describe, expect, it, vi } from "vitest";
import {
  createTesseractWorker,
  extractPromotionDealsFromPages,
  parsePromotionAsset
} from "@/lib/promotions/parser";

describe("weekly promotion parser", () => {
  it("starts Tesseract with the packaged Node worker path", async () => {
    const worker = { recognize: vi.fn(), terminate: vi.fn() };
    const createWorker = vi.fn(async () => worker);

    await expect(createTesseractWorker(createWorker)).resolves.toBe(worker);
    expect(createWorker).toHaveBeenCalledWith(
      "eng",
      1,
      expect.objectContaining({
        workerPath: expect.stringContaining(
          "node_modules/tesseract.js/src/worker-script/node/index.js"
        )
      })
    );
  });

  it("extracts snack and ice cream deals with price and promo text", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: [
          "TILLAMOOK Ice Cream Assorted 1.42L",
          "WAS $19.25",
          "$14.95",
          "CHEETOS Corn Puff Snacks Assorted 200g/215g",
          "ANY 2 $4.70",
          "BUY 1 GET 1 FREE",
          "DOVE Body Wash 1L $7.90"
        ].join("\\n")
      }
    ]);

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "ICE_CREAM", rawTitle: expect.stringContaining("TILLAMOOK"), parsedPrice: 14.95 }),
        expect.objectContaining({ category: "SNACKS", rawTitle: expect.stringContaining("CHEETOS"), promoText: expect.stringContaining("ANY 2") })
      ])
    );
    expect(deals.some((deal) => deal.rawTitle.includes("DOVE"))).toBe(false);
  });

  it("falls back to local OCR when PDF text is sparse", async () => {
    const deals = await parsePromotionAsset(
      {
        assetBytes: Buffer.from("image-heavy-pdf"),
        assetKind: "pdf",
        assetUrl: "https://example.com/flyer.pdf"
      },
      {
        extractTextPages: async () => [{ pageNumber: 1, text: "" }],
        ocrAssetPages: async () => [
          {
            pageNumber: 1,
            text: "BEN & JERRY'S Ice Cream Assorted 427ml $9.95"
          }
        ]
      }
    );

    expect(deals).toEqual([
      expect.objectContaining({ category: "ICE_CREAM", rawTitle: expect.stringContaining("BEN & JERRY"), parsedPrice: 9.95 })
    ]);
  });

  it("uses verified FairPrice flyer card data when full-page OCR is too noisy", async () => {
    const deals = await parsePromotionAsset({
      assetBytes: Buffer.from("current-fairprice-weekly-savers"),
      assetKind: "image",
      assetUrl: "https://view.publitas.com/91990/1790843/pages/f550e9f6-eb67-48fb-b29c-691343bbe981-at1600.jpg"
    });

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "SNACKS",
          rawTitle: "KIT KAT Block Chocolates Assorted 160g",
          priceText: "$4.20"
        }),
        expect.objectContaining({
          category: "SNACKS",
          rawTitle: "KETTLE Potato Chips Assorted 141g",
          priceText: "$10.00",
          promoText: "2 FOR"
        })
      ])
    );
  });

  it("uses verified Giant flyer card data when the PDF has no embedded text", async () => {
    const deals = await parsePromotionAsset({
      assetBytes: Buffer.from("current-giant-super-savings"),
      assetKind: "pdf",
      assetUrl: "https://giant.sg/media/uploads/filemanager/28may-gss.pdf"
    });

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "SNACKS",
          rawTitle: "CHEETOS Crunchy Cheese/Cheddar Jalapeno/Puffs/Flaming Assorted 200g/215g",
          priceText: "$4.70"
        }),
        expect.objectContaining({
          category: "ICE_CREAM",
          rawTitle: "BEN & JERRY'S Ice Cream Assorted 427ml-473ml",
          priceText: "$27.50",
          promoText: "ANY 3"
        })
      ])
    );
  });

  it("uses verified Cold Storage flyer card data when serverless PDF parsing is unavailable", async () => {
    const deals = await parsePromotionAsset(
      {
        assetBytes: Buffer.from("current-cold-storage-grocery-selections"),
        assetKind: "pdf",
        assetUrl: "http://csp.coldstorage.com.sg/media/weeklydeals/371/wk22_28_may_grocery_a3_fa-v1-20260527123710.pdf"
      },
      {
        extractTextPages: async () => {
          throw new Error("pdf runtime unavailable");
        }
      }
    );

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "ICE_CREAM",
          rawTitle: "TILLAMOOK Ice Cream Assorted 1.42L",
          priceText: "$14.95"
        }),
        expect.objectContaining({
          category: "SNACKS",
          rawTitle: "CHEETOS Corn Puff Snacks Assorted 200g/215g",
          priceText: "$4.70"
        })
      ])
    );
  });

  it("uses verified Sheng Siong flyer cards instead of loose OCR grouping", async () => {
    const deals = await parsePromotionAsset({
      assetBytes: Buffer.from("current-sheng-siong-four-days-special"),
      assetKind: "pdf",
      assetUrl: "https://shengsiongcontent.s3.ap-southeast-1.amazonaws.com/wp-content/uploads/2026/05/26135433/SSAD26-1162-4-DAYS-28-310526-ST_ET.pdf"
    });

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "SNACKS",
          rawTitle: "DORITOS Tortilla Chips Assorted Flavours 190g",
          priceText: "$7.95",
          promoText: "For 2; SAVE 25%"
        }),
        expect.objectContaining({
          category: "ICE_CREAM",
          rawTitle: "HAAGEN-DAZS Ice Cream Assorted Flavours 420ml-473ml",
          priceText: "$25.00",
          promoText: "For 3; SAVE 43%"
        })
      ])
    );
  });

  it("skips unverified Sheng Siong dense flyers rather than queuing noisy OCR candidates", async () => {
    const deals = await parsePromotionAsset(
      {
        assetBytes: Buffer.from("unverified-sheng-siong-flyer"),
        assetKind: "pdf",
        assetUrl: "https://shengsiongcontent.s3.ap-southeast-1.amazonaws.com/some-future-flyer.pdf"
      },
      {
        extractTextPages: async () => [{ pageNumber: 1, text: "" }],
        ocrAssetPages: async () => [
          {
            pageNumber: 1,
            text: "Jacobs Savoury Cracker iii HEINZ Veggie Mayonnaise $17.95 UP: uP.sase"
          }
        ]
      }
    );

    expect(deals).toEqual([]);
  });

  it("does not create no-price candidates just because the page has unrelated prices", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: [
          "TILLAMOOK",
          "Ice Cream",
          "Assorted",
          "1.42L",
          "CHEETOS",
          "Corn Puff",
          "Snacks",
          "Assorted",
          "200g/215g",
          "Laundry Detergent",
          "WAS $19.25",
          "$",
          "14",
          "95",
          "BUY 1 GET 1",
          "FREE"
        ].join("\n")
      }
    ]);

    expect(deals).toEqual([]);
  });

  it("rejects unreadable OCR candidates even when a noisy line includes a price", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: "T-24 FS» “¢ Assorted & Biscuits Mini Biscuits [iE Assorted Assorted 300g SCE) # 160g Assorted )/ Assorted ol 190 sing 141g A UP $12.60"
      }
    ]);

    expect(deals).toEqual([]);
  });

  it("extracts prices from positioned flyer cards when PDF text splits dollar and cents", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: "",
        items: [
          { str: "CHEETOS", x: 65.3, y: 826.2, width: 42.5, height: 10 },
          { str: "Corn Puff", x: 65.3, y: 837.6, width: 43.8, height: 10 },
          { str: "Snacks", x: 65.3, y: 849.0, width: 34.4, height: 10 },
          { str: "Assorted", x: 65.3, y: 860.4, width: 42.7, height: 10 },
          { str: "200g/215g", x: 65.3, y: 871.8, width: 49.0, height: 10 },
          { str: "$", x: 138.9, y: 842.0, width: 11.2, height: 10 },
          { str: "4", x: 150.1, y: 850.7, width: 17.8, height: 10 },
          { str: "70", x: 167.9, y: 842.0, width: 20.4, height: 10 },
          { str: "SAVE $1.20", x: 141.8, y: 863.0, width: 43.5, height: 10 },
          { str: "WAS $5.90", x: 150.1, y: 868.8, width: 27.0, height: 10 },
          { str: "TILLAMOOK", x: 648.5, y: 1025.8, width: 52.6, height: 10 },
          { str: "Ice Cream", x: 648.5, y: 1037.2, width: 49.7, height: 10 },
          { str: "Assorted", x: 648.5, y: 1048.6, width: 42.7, height: 10 },
          { str: "1.42L", x: 648.5, y: 1060.0, width: 20.7, height: 10 },
          { str: "$", x: 714.9, y: 1030.9, width: 11.2, height: 10 },
          { str: "14", x: 726.1, y: 1039.6, width: 29.2, height: 10 },
          { str: "95", x: 755.2, y: 1030.9, width: 19.4, height: 10 },
          { str: "SAVE $2", x: 728.4, y: 1051.9, width: 32.7, height: 10 },
          { str: "WAS $16.95", x: 730.5, y: 1057.7, width: 28.5, height: 10 }
        ]
      }
    ]);

    expect(deals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "SNACKS",
          rawTitle: "CHEETOS Corn Puff Snacks Assorted 200g/215g",
          priceText: "$4.70",
          parsedPrice: 4.7,
          promoText: "SAVE $1.20; WAS $5.90"
        }),
        expect.objectContaining({
          category: "ICE_CREAM",
          rawTitle: "TILLAMOOK Ice Cream Assorted 1.42L",
          priceText: "$14.95",
          parsedPrice: 14.95,
          promoText: "SAVE $2; WAS $16.95"
        })
      ])
    );
  });

  it("uses a taller positioned card window for flyer titles above price bubbles", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: "",
        items: [
          { str: "LINDT", x: 342.5, y: 486.9, width: 23, height: 10 },
          { str: "Excellence", x: 342.5, y: 497.1, width: 44.6, height: 10 },
          { str: "Chocolate", x: 342.5, y: 507.3, width: 44.4, height: 10 },
          { str: "Block", x: 342.5, y: 517.5, width: 22.8, height: 10 },
          { str: "Assorted", x: 342.5, y: 527.7, width: 38.2, height: 10 },
          { str: "100g", x: 342.5, y: 537.9, width: 19.9, height: 10 },
          { str: "$", x: 340.9, y: 580.3, width: 12.6, height: 10 },
          { str: "7", x: 353.6, y: 590, width: 17.3, height: 10 },
          { str: "95", x: 370.8, y: 578.9, width: 19.4, height: 10 },
          { str: "SAVE $3.35", x: 342.4, y: 603.8, width: 49.6, height: 10 },
          { str: "WAS $11.30", x: 351.6, y: 610.4, width: 31.3, height: 10 }
        ]
      }
    ]);

    expect(deals).toEqual([
      expect.objectContaining({
        category: "SNACKS",
        rawTitle: "LINDT Excellence Chocolate Block Assorted 100g",
        priceText: "$7.95",
        parsedPrice: 7.95,
        promoText: "SAVE $3.35; WAS $11.30"
      })
    ]);
  });

  it("extracts positioned promo-only snack cards without price bubbles", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: "",
        items: [
          { str: "COBS", x: 426, y: 477.5, width: 36.3, height: 10 },
          { str: "Popcorn", x: 426, y: 493.1, width: 54.4, height: 10 },
          { str: "Assorted", x: 426, y: 508.7, width: 58.4, height: 10 },
          { str: "80g - 120g", x: 426, y: 524.3, width: 67.8, height: 10 },
          { str: "LINDT", x: 342.5, y: 486.9, width: 23, height: 10 },
          { str: "Excellence", x: 342.5, y: 497.1, width: 44.6, height: 10 },
          { str: "Chocolate", x: 342.5, y: 507.3, width: 44.4, height: 10 },
          { str: "Block", x: 342.5, y: 517.5, width: 22.8, height: 10 },
          { str: "BUY 1 GET 1", x: 435.1, y: 568, width: 76.7, height: 10 },
          { str: "FREE", x: 435.6, y: 596, width: 75.7, height: 10 },
          { str: "WAS $4.60 EACH", x: 440.3, y: 621.1, width: 66.3, height: 10 }
        ]
      }
    ]);

    expect(deals).toEqual([
      expect.objectContaining({
        category: "SNACKS",
        rawTitle: "COBS Popcorn Assorted 80g - 120g",
        priceText: null,
        parsedPrice: null,
        promoText: "BUY 1 GET 1 FREE; WAS $4.60 EACH"
      })
    ]);
  });

  it("classifies snack flyer terms beyond chocolate and chips", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 2,
        text: "",
        items: [
          { str: "FALWASSER", x: 437.9, y: 276.8, width: 55, height: 10 },
          { str: "Crispbread", x: 437.9, y: 288.2, width: 55, height: 10 },
          { str: "Assorted", x: 437.9, y: 299.6, width: 55, height: 10 },
          { str: "120g", x: 437.9, y: 311, width: 24, height: 10 },
          { str: "$", x: 530.5, y: 276.2, width: 13.1, height: 10 },
          { str: "7", x: 543.6, y: 286.4, width: 13, height: 10 },
          { str: "55", x: 561.6, y: 276.2, width: 20, height: 10 },
          { str: "SAVE $2.60", x: 531, y: 300.8, width: 52.7, height: 10 },
          { str: "WAS $10.15", x: 540.9, y: 307.6, width: 32.8, height: 10 }
        ]
      }
    ]);

    expect(deals).toEqual([
      expect.objectContaining({
        category: "SNACKS",
        rawTitle: "FALWASSER Crispbread Assorted 120g",
        priceText: "$7.55",
        parsedPrice: 7.55
      })
    ]);
  });

  it("extracts FairPrice-style image OCR cards from positioned words", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 1,
        text: "",
        items: [
          { str: "4", x: 258, y: 604, width: 26, height: 28 },
          { str: "20", x: 292, y: 604, width: 22, height: 18 },
          { str: "per", x: 292, y: 628, width: 18, height: 9 },
          { str: "pack", x: 292, y: 638, width: 24, height: 12 },
          { str: "SAVE 34%", x: 356, y: 604, width: 58, height: 12 },
          { str: "KIT", x: 258, y: 682, width: 18, height: 10 },
          { str: "KAT", x: 281, y: 682, width: 22, height: 10 },
          { str: "Block", x: 258, y: 696, width: 32, height: 10 },
          { str: "Chocolates", x: 295, y: 696, width: 65, height: 10 },
          { str: "Assorted", x: 257, y: 710, width: 52, height: 10 },
          { str: "160g", x: 258, y: 723, width: 26, height: 13 },
          { str: "U.P.", x: 257, y: 742, width: 20, height: 10 },
          { str: "$6.40", x: 286, y: 742, width: 32, height: 10 }
        ]
      }
    ]);

    expect(deals).toEqual([
      expect.objectContaining({
        category: "SNACKS",
        rawTitle: "KIT KAT Block Chocolates Assorted 160g",
        priceText: "$4.20",
        parsedPrice: 4.2,
        promoText: "SAVE 34%; U.P. $6.40"
      })
    ]);
  });

  it("extracts Giant-style image OCR cards with compact price text", () => {
    const deals = extractPromotionDealsFromPages([
      {
        pageNumber: 2,
        text: "",
        items: [
          { str: "B=(5470", x: 774, y: 715, width: 76, height: 28 },
          { str: "CHEETOS", x: 706, y: 658, width: 42, height: 10 },
          { str: "Crunchy", x: 706, y: 682, width: 45, height: 10 },
          { str: "Cheese/", x: 706, y: 696, width: 43, height: 10 },
          { str: "Cheddar", x: 706, y: 710, width: 43, height: 10 },
          { str: "Jalapeno/", x: 706, y: 724, width: 53, height: 10 },
          { str: "Puffs/", x: 706, y: 738, width: 35, height: 10 },
          { str: "Flaming", x: 706, y: 752, width: 44, height: 10 },
          { str: "Assorted", x: 706, y: 766, width: 52, height: 10 },
          { str: "200g/215g", x: 706, y: 780, width: 60, height: 10 },
          { str: "SAVE $1.15", x: 775, y: 748, width: 55, height: 10 },
          { str: "WAS $5.85", x: 775, y: 762, width: 52, height: 10 }
        ]
      }
    ]);

    expect(deals).toEqual([
      expect.objectContaining({
        category: "SNACKS",
        rawTitle: "CHEETOS Crunchy Cheese/ Cheddar Jalapeno/ Puffs/ Flaming Assorted 200g/215g",
        priceText: "$4.70",
        parsedPrice: 4.7,
        promoText: "SAVE $1.15; WAS $5.85"
      })
    ]);
  });
});
