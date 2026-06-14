import type { ParsedRetailerProduct } from "./product-page-types";
import WebSocket, { type RawData } from "ws";

const SHENG_SIONG_SOCKET_URL = "wss://shengsiong.com.sg/websocket";
const SHENG_SIONG_IMAGE_BASE =
  "https://ssecomm.s3.ap-southeast-1.amazonaws.com/products/md";
const REQUEST_TIMEOUT_MS = 15_000;

type ShengSiongProduct = {
  itemCode?: unknown;
  brand?: unknown;
  name?: unknown;
  packSize?: unknown;
  price?: unknown;
  prevPrice?: unknown;
  isArchived?: unknown;
  listingOnEcomm?: unknown;
  isSoldOut?: unknown;
  imgKey?: unknown;
  tag?: unknown;
  [key: string]: unknown;
};

type DdpMessage = {
  msg?: unknown;
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

export async function scrapeShengSiongProductPage(
  productUrl: string
): Promise<ParsedRetailerProduct> {
  const slug = getProductSlug(productUrl);
  const product = await callShengSiongProductMethod(slug);
  return parseShengSiongProduct(product, productUrl);
}

export function parseShengSiongProduct(
  product: ShengSiongProduct,
  productUrl: string
): ParsedRetailerProduct {
  const brand = getRequiredString(product.brand);
  const name = getRequiredString(product.name);
  const packSize = getRequiredString(product.packSize);
  const price = getPositiveNumber(product.price);
  const itemCode = getRequiredString(product.itemCode);

  if (!brand || !name || !packSize || price === null || !itemCode) {
    throw new Error("INVALID_SHENG_SIONG_PRODUCT");
  }

  const previousPrice = getPositiveNumber(product.prevPrice);
  const imgKey = getOptionalString(product.imgKey);
  const promotionText = getOptionalString(product.tag);

  return {
    retailerSlug: "sheng-siong",
    titleRaw: `${brand} ${name} ${packSize}`,
    price,
    originalPrice:
      previousPrice !== null && previousPrice > price ? previousPrice : null,
    productUrl,
    imageUrl: imgKey
      ? `${SHENG_SIONG_IMAGE_BASE}/${imgKey}.0.jpg`
      : undefined,
    isAvailable:
      product.isArchived !== true &&
      product.listingOnEcomm === true &&
      product.isSoldOut !== true,
    retailerSku: itemCode,
    brandRaw: brand,
    currency: "SGD",
    promotionText,
    size: packSize,
    rawMetadata: product
  };
}

function getProductSlug(productUrl: string): string {
  const url = new URL(productUrl);
  const match = url.pathname.match(/^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
  if (url.hostname !== "shengsiong.com.sg" || !match?.[1]) {
    throw new Error("INVALID_SHENG_SIONG_URL");
  }
  return match[1];
}

function callShengSiongProductMethod(
  slug: string
): Promise<ShengSiongProduct> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(SHENG_SIONG_SOCKET_URL);
    const requestId = "product";
    let settled = false;
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("SHENG_SIONG_TIMEOUT")));
    }, REQUEST_TIMEOUT_MS);

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
      socket.terminate();
    };

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          msg: "connect",
          version: "1",
          support: ["1", "pre2", "pre1"]
        })
      );
    });

    socket.on("message", (data) => {
      const message = parseDdpMessage(data);
      if (!message) {
        return;
      }

      if (message.msg === "ping") {
        socket.send(JSON.stringify({ msg: "pong", id: message.id }));
        return;
      }

      if (message.msg === "connected") {
        socket.send(
          JSON.stringify({
            msg: "method",
            method: "Products.getOneByIdOrSlug",
            params: [slug, null, { slug: "", category: { slug: "" } }],
            id: requestId
          })
        );
        return;
      }

      if (message.msg !== "result" || message.id !== requestId) {
        return;
      }

      const result = message.result;
      if (message.error || !isRecord(result)) {
        finish(() => reject(new Error("SHENG_SIONG_FETCH_FAILED")));
        return;
      }

      finish(() => resolve(result));
    });

    socket.on("error", () => {
      finish(() => reject(new Error("SHENG_SIONG_FETCH_FAILED")));
    });
  });
}

function parseDdpMessage(data: RawData): DdpMessage | null {
  try {
    const parsed = JSON.parse(data.toString());
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRequiredString(value: unknown): string | null {
  const normalized = getOptionalString(value);
  return normalized ?? null;
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

function getPositiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
