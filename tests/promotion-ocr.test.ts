import { describe, expect, it, vi } from "vitest";
import {
  createTesseractWorker,
  findFairPriceCardRegions,
  ocrAssetPages,
  type FairPriceCardRegion
} from "@/lib/promotions/ocr";

describe("promotion OCR", () => {
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

  it("assigns distinct region ids and translates card coordinates", async () => {
    const regions: FairPriceCardRegion[] = [
      { regionId: "card-1", x: 20, y: 300, width: 300, height: 260 },
      { regionId: "card-2", x: 340, y: 300, width: 300, height: 260 }
    ];

    const pages = await ocrAssetPages(
      {
        assetBytes: Buffer.from("fairprice-page"),
        assetKind: "image",
        assetUrl: "https://example.com/unknown-publication.jpg",
        parserKind: "fairprice-grid"
      },
      {
        loadImage: async () => ({ width: 1404, height: 1824 }),
        findFairPriceCardRegions: () => regions,
        cropImage: async (_image, region) => Buffer.from(region.regionId),
        recognizeImage: async (bytes) => ({
          text: bytes.toString(),
          items: [{ str: "MAGNUM", x: 5, y: 7, width: 40, height: 12 }]
        })
      }
    );

    expect(pages[0].items).toEqual([
      expect.objectContaining({
        str: "MAGNUM",
        x: 25,
        y: 307,
        regionId: "card-1"
      }),
      expect.objectContaining({
        str: "MAGNUM",
        x: 345,
        y: 307,
        regionId: "card-2"
      })
    ]);
  });

  it("drops only the failed FairPrice card crop", async () => {
    const regions: FairPriceCardRegion[] = [
      { regionId: "card-1", x: 20, y: 300, width: 300, height: 260 },
      { regionId: "card-2", x: 340, y: 300, width: 300, height: 260 }
    ];

    const pages = await ocrAssetPages(
      {
        assetBytes: Buffer.from("fairprice-page"),
        assetKind: "image",
        assetUrl: "https://example.com/unknown-publication.jpg",
        parserKind: "fairprice-grid"
      },
      {
        loadImage: async () => ({ width: 1404, height: 1824 }),
        findFairPriceCardRegions: () => regions,
        cropImage: async (_image, region) => Buffer.from(region.regionId),
        recognizeImage: async (bytes) => {
          if (bytes.toString() === "card-1") {
            throw new Error("crop OCR failed");
          }
          return {
            text: "LAYS",
            items: [{ str: "LAYS", x: 8, y: 9, width: 30, height: 10 }]
          };
        }
      }
    );

    expect(pages).toEqual([
      {
        pageNumber: 1,
        text: "LAYS",
        items: [
          expect.objectContaining({
            str: "LAYS",
            x: 348,
            y: 309,
            regionId: "card-2"
          })
        ]
      }
    ]);
  });

  it("ignores blue callouts and isolated product shapes between card rows", () => {
    const width = 600;
    const height = 800;
    const data = new Uint8ClampedArray(width * height * 4);
    for (const [x, y, badgeWidth, badgeHeight] of [
      [30, 220, 70, 48],
      [230, 220, 70, 48],
      [430, 220, 70, 48],
      [30, 480, 70, 48],
      [230, 480, 70, 48],
      [430, 480, 70, 48],
      [310, 330, 90, 20],
      [120, 360, 70, 48]
    ]) {
      fillBlueRectangle(data, width, x, y, badgeWidth, badgeHeight);
    }

    const regions = findFairPriceCardRegions({ width, height, data });

    expect(regions).toHaveLength(6);
    expect(new Set(regions.map((region) => region.regionId)).size).toBe(6);
  });
});

function fillBlueRectangle(
  data: Uint8ClampedArray,
  imageWidth: number,
  left: number,
  top: number,
  width: number,
  height: number
) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 95;
      data[offset + 2] = 150;
      data[offset + 3] = 255;
    }
  }
}
