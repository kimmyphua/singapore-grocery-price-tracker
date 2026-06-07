import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { preferredRegion } from "@/app/api/promotions/refresh/route";

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");

describe("promotion refresh route", () => {
  it("runs near the Tokyo Supabase database", () => {
    expect(preferredRegion).toBe("hnd1");
  });

  it("packages all Tesseract Node worker runtime dependencies", () => {
    const includes =
      nextConfig.experimental.outputFileTracingIncludes["/api/promotions/refresh"];

    expect(includes).toEqual(
      expect.arrayContaining([
        "./node_modules/tesseract.js/src/**/*",
        "./node_modules/tesseract.js-core/**/*",
        "./node_modules/regenerator-runtime/**/*",
        "./node_modules/is-url/**/*",
        "./node_modules/wasm-feature-detect/**/*",
        "./node_modules/bmp-js/**/*",
        "./node_modules/node-fetch/**/*"
      ])
    );
  });
});
