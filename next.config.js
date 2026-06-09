/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/promotions/refresh": [
        "./node_modules/@napi-rs/canvas*/**/*",
        "./node_modules/pdfjs-dist/**/*",
        "./node_modules/tesseract.js/src/**/*",
        "./node_modules/tesseract.js-core/**/*",
        "./node_modules/regenerator-runtime/**/*",
        "./node_modules/is-url/**/*",
        "./node_modules/wasm-feature-detect/**/*",
        "./node_modules/bmp-js/**/*",
        "./node_modules/node-fetch/**/*"
      ]
    },
    serverComponentsExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"]
  }
};

module.exports = nextConfig;
