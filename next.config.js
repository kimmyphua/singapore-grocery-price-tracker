/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/promotions/refresh": [
        "./node_modules/@napi-rs/canvas*/**/*",
        "./node_modules/tesseract.js/src/**/*",
        "./node_modules/tesseract.js-core/**/*"
      ]
    },
    serverComponentsExternalPackages: ["@napi-rs/canvas"]
  }
};

module.exports = nextConfig;
