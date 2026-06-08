import path from "node:path";
import type {
  PromotionAssetKind,
  PromotionParserKind,
  PromotionTextItem,
  PromotionTextPage
} from "./types";

export type PromotionOcrInput = {
  assetBytes: Buffer;
  assetKind: PromotionAssetKind;
  assetUrl: string;
  parserKind: PromotionParserKind;
};

export type FairPriceCardRegion = {
  regionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PromotionImage = {
  width: number;
  height: number;
  data?: Uint8ClampedArray;
  canvas?: any;
};

type RecognizedImage = Omit<PromotionTextPage, "pageNumber">;

type PromotionOcrDeps = {
  loadImage?: (bytes: Buffer) => Promise<PromotionImage>;
  findFairPriceCardRegions?: (
    image: PromotionImage
  ) => FairPriceCardRegion[];
  cropImage?: (
    image: PromotionImage,
    region: FairPriceCardRegion
  ) => Promise<Buffer>;
  recognizeImage?: (bytes: Buffer) => Promise<RecognizedImage>;
};

export async function extractTextPages(
  input: PromotionOcrInput
): Promise<PromotionTextPage[]> {
  if (input.assetKind === "image") {
    return ocrAssetPages(input);
  }

  const pdfjs = await loadRuntimeModule<any>(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
  const document = await pdfjs.getDocument({
    data: new Uint8Array(input.assetBytes),
    disableFontFace: true,
    isEvalSupported: false
  } as any).promise;
  const pages: PromotionTextPage[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= document.numPages;
    pageNumber += 1
  ) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PromotionTextItem[] = content.items
      .map((item: any): PromotionTextItem | null => {
        if (!("str" in item) || !item.str.trim()) {
          return null;
        }
        const [, , , , x, y] = item.transform;
        return {
          str: String(item.str).trim(),
          x,
          y: viewport.height - y,
          width: item.width,
          height: item.height
        };
      })
      .filter(
        (item: PromotionTextItem | null): item is PromotionTextItem =>
          item !== null
      );
    pages.push({
      pageNumber,
      text: items.map((item) => item.str).join("\n"),
      items
    });
  }

  return pages;
}

export async function ocrAssetPages(
  input: PromotionOcrInput,
  deps: PromotionOcrDeps = {}
): Promise<PromotionTextPage[]> {
  if (input.assetKind === "image") {
    if (input.parserKind === "fairprice-grid") {
      return [await recognizeFairPriceGrid(input.assetBytes, deps)];
    }
    return [
      {
        pageNumber: 1,
        ...(await (deps.recognizeImage ?? recognizeImagePage)(
          input.assetBytes
        ))
      }
    ];
  }

  const imagePages = await renderPdfPages(input.assetBytes);
  const pages: PromotionTextPage[] = [];
  for (const imagePage of imagePages) {
    pages.push({
      pageNumber: imagePage.pageNumber,
      ...(await (deps.recognizeImage ?? recognizeImagePage)(imagePage.bytes))
    });
  }
  return pages;
}

async function recognizeFairPriceGrid(
  bytes: Buffer,
  deps: PromotionOcrDeps
): Promise<PromotionTextPage> {
  const loadImage = deps.loadImage ?? defaultLoadImage;
  const image = await loadImage(bytes);
  const findRegions =
    deps.findFairPriceCardRegions ?? findFairPriceCardRegions;
  const cropImage = deps.cropImage ?? defaultCropImage;
  const recognizer = deps.recognizeImage
    ? null
    : await createImageRecognizer();
  const recognizeImage = deps.recognizeImage ?? recognizer!.recognize;
  const regions = findRegions(image);
  const textParts: string[] = [];
  const items: PromotionTextItem[] = [];

  try {
    for (const region of regions) {
      try {
        const crop = await cropImage(image, region);
        const recognized = await recognizeImage(crop);
        if (recognized.text.trim()) {
          textParts.push(recognized.text.trim());
        }
        for (const item of recognized.items ?? []) {
          items.push({
            ...item,
            x: item.x + region.x,
            y: item.y + region.y,
            regionId: region.regionId
          });
        }
      } catch {
        // One unreadable card must not discard other card or page results.
      }
    }
  } finally {
    await recognizer?.terminate();
  }

  return {
    pageNumber: 1,
    text: textParts.join("\n"),
    items
  };
}

export function findFairPriceCardRegions(
  image: PromotionImage
): FairPriceCardRegion[] {
  if (!image.data) {
    return [];
  }

  const headerBottom = Math.round(image.height * 0.24);
  const badges = findBlueBadgeBounds(
    image.data,
    image.width,
    image.height,
    headerBottom
  );
  if (badges.length === 0) {
    return [];
  }

  const clusteredRows = clusterBadgeRows(badges, image.height);
  const regularRows = clusteredRows.filter((row) => row.length >= 3);
  const rows = regularRows.length > 0 ? regularRows : clusteredRows;
  return rows.flatMap((row, rowIndex) => {
    const sorted = [...row].sort((left, right) => left.x - right.x);
    const rowCenter =
      sorted.reduce((sum, badge) => sum + badge.y + badge.height / 2, 0) /
      sorted.length;
    const previousCenter =
      rowIndex === 0
        ? headerBottom
        : getRowCenter(rows[rowIndex - 1]);
    const nextCenter =
      rowIndex === rows.length - 1
        ? image.height
        : getRowCenter(rows[rowIndex + 1]);
    const top = Math.max(
      headerBottom,
      Math.round((previousCenter + rowCenter) / 2)
    );
    const bottom = Math.min(
      image.height,
      Math.round((rowCenter + nextCenter) / 2)
    );

    return sorted.map((badge, columnIndex) => {
      const center = badge.x + badge.width / 2;
      const previousX =
        columnIndex === 0
          ? 0
          : sorted[columnIndex - 1].x +
            sorted[columnIndex - 1].width / 2;
      const nextX =
        columnIndex === sorted.length - 1
          ? image.width
          : sorted[columnIndex + 1].x +
            sorted[columnIndex + 1].width / 2;
      const left = Math.max(0, Math.round((previousX + center) / 2));
      const right = Math.min(
        image.width,
        Math.round((center + nextX) / 2)
      );

      return {
        regionId: `row-${rowIndex + 1}-card-${columnIndex + 1}`,
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top)
      };
    });
  });
}

type BadgeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function findBlueBadgeBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  headerBottom: number
): BadgeBounds[] {
  const step = 4;
  const gridWidth = Math.ceil(width / step);
  const gridHeight = Math.ceil(height / step);
  const active = new Uint8Array(gridWidth * gridHeight);
  const visited = new Uint8Array(active.length);

  for (
    let gridY = Math.floor(headerBottom / step);
    gridY < gridHeight;
    gridY += 1
  ) {
    for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const x = Math.min(width - 1, gridX * step);
      const y = Math.min(height - 1, gridY * step);
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (
        red < 55 &&
        green >= 55 &&
        green <= 145 &&
        blue >= 95 &&
        blue <= 190 &&
        blue > green
      ) {
        active[gridY * gridWidth + gridX] = 1;
      }
    }
  }

  const components: BadgeBounds[] = [];
  for (let index = 0; index < active.length; index += 1) {
    if (!active[index] || visited[index]) {
      continue;
    }
    const queue = [index];
    visited[index] = 1;
    let minX = gridWidth;
    let maxX = 0;
    let minY = gridHeight;
    let maxY = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % gridWidth;
      const y = Math.floor(current / gridWidth);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (const [nextX, nextY] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ]) {
        if (
          nextX < 0 ||
          nextX >= gridWidth ||
          nextY < 0 ||
          nextY >= gridHeight
        ) {
          continue;
        }
        const next = nextY * gridWidth + nextX;
        if (active[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    const component = {
      x: minX * step,
      y: minY * step,
      width: (maxX - minX + 1) * step,
      height: (maxY - minY + 1) * step
    };
    const aspectRatio = component.width / component.height;
    if (
      component.width >= width * 0.045 &&
      component.width <= width * 0.16 &&
      component.height >= height * 0.018 &&
      component.height <= height * 0.09 &&
      aspectRatio <= 3.2
    ) {
      components.push(component);
    }
  }

  return components;
}

function clusterBadgeRows(badges: BadgeBounds[], height: number) {
  const rows: BadgeBounds[][] = [];
  const tolerance = height * 0.055;

  for (const badge of [...badges].sort((left, right) => left.y - right.y)) {
    const center = badge.y + badge.height / 2;
    const row = rows.find(
      (candidate) => Math.abs(getRowCenter(candidate) - center) <= tolerance
    );
    if (row) {
      row.push(badge);
    } else {
      rows.push([badge]);
    }
  }

  return rows;
}

function getRowCenter(row: BadgeBounds[]) {
  return (
    row.reduce(
      (sum, badge) => sum + badge.y + badge.height / 2,
      0
    ) / row.length
  );
}

async function defaultLoadImage(bytes: Buffer): Promise<PromotionImage> {
  const { createCanvas, loadImage } = await loadRuntimeModule<any>(
    "@napi-rs/canvas"
  );
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return {
    width: image.width,
    height: image.height,
    data: imageData.data,
    canvas
  };
}

async function defaultCropImage(
  image: PromotionImage,
  region: FairPriceCardRegion
): Promise<Buffer> {
  const { createCanvas } = await loadRuntimeModule<any>("@napi-rs/canvas");
  if (!image.data) {
    throw new Error("Promotion image pixels are unavailable");
  }
  const sourceCanvas =
    image.canvas ?? createCanvas(image.width, image.height);
  if (!image.canvas) {
    const sourceContext = sourceCanvas.getContext("2d");
    const imageData = sourceContext.createImageData(
      image.width,
      image.height
    );
    imageData.data.set(image.data);
    sourceContext.putImageData(imageData, 0, 0);
  }

  const crop = createCanvas(region.width, region.height);
  crop
    .getContext("2d")
    .drawImage(
      sourceCanvas,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height
    );
  return crop.toBuffer("image/png");
}

async function renderPdfPages(assetBytes: Buffer) {
  const [{ createCanvas }, pdfjs] = await Promise.all([
    loadRuntimeModule<any>("@napi-rs/canvas"),
    loadRuntimeModule<any>("pdfjs-dist/legacy/build/pdf.mjs")
  ]);
  const document = await pdfjs.getDocument({
    data: new Uint8Array(assetBytes),
    disableFontFace: true,
    isEvalSupported: false
  } as any).promise;
  const pages: Array<{ pageNumber: number; bytes: Buffer }> = [];

  for (
    let pageNumber = 1;
    pageNumber <= document.numPages;
    pageNumber += 1
  ) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const context = canvas.getContext("2d") as any;
    await page.render({ canvasContext: context, viewport, canvas } as any)
      .promise;
    pages.push({
      pageNumber,
      bytes: canvas.toBuffer("image/png")
    });
  }

  return pages;
}

async function recognizeImagePage(
  bytes: Buffer
): Promise<RecognizedImage> {
  const recognizer = await createImageRecognizer();
  try {
    return await recognizer.recognize(bytes);
  } finally {
    await recognizer.terminate();
  }
}

async function createImageRecognizer(): Promise<{
  recognize: (bytes: Buffer) => Promise<RecognizedImage>;
  terminate: () => Promise<void>;
}> {
  const tesseract = await loadRuntimeModule<any>("tesseract.js");
  const createWorker =
    tesseract.createWorker ?? tesseract.default?.createWorker;
  if (typeof createWorker === "function") {
    const worker = await createTesseractWorker(createWorker);
    return {
      recognize: async (bytes) => {
        const result = await worker.recognize(bytes, {}, { tsv: true });
        return {
          text: result.data.text,
          items: parseTesseractTsv(result.data.tsv)
        };
      },
      terminate: () => worker.terminate()
    };
  }

  const recognize = tesseract.recognize ?? tesseract.default?.recognize;
  if (typeof recognize !== "function") {
    throw new Error("tesseract.js recognize function is unavailable");
  }
  return {
    recognize: async (bytes) => {
      const result = await recognize(bytes, "eng");
      return { text: result.data.text };
    },
    terminate: async () => {}
  };
}

export function createTesseractWorker(
  createWorker: (
    langs: string,
    oem: number,
    options: { workerPath: string }
  ) => Promise<any>
) {
  return createWorker("eng", 1, {
    workerPath: path.join(
      process.cwd(),
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js"
    )
  });
}

export function parseTesseractTsv(
  tsv: string | null | undefined
): PromotionTextItem[] {
  if (!tsv) {
    return [];
  }

  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line): PromotionTextItem | null => {
      const columns = line.split("\t");
      const [level, , , , , , left, top, width, height, , text] =
        columns;
      if (level !== "5" || !text?.trim()) {
        return null;
      }
      return {
        str: text.trim(),
        x: Number(left),
        y: Number(top),
        width: Number(width),
        height: Number(height)
      };
    })
    .filter((item): item is PromotionTextItem => item !== null)
    .filter(
      (item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height)
    );
}

async function loadRuntimeModule<T>(specifier: string): Promise<T> {
  if (specifier === "pdfjs-dist/legacy/build/pdf.mjs") {
    return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as T;
  }
  if (specifier === "@napi-rs/canvas") {
    const importer = new Function(
      "specifier",
      "return import(specifier)"
    ) as (specifier: string) => Promise<T>;
    return importer(specifier);
  }
  if (specifier === "tesseract.js") {
    return (await import("tesseract.js")) as T;
  }
  throw new Error(
    `Unsupported promotion OCR runtime module: ${specifier}`
  );
}
