/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/promotions/refresh": ["./node_modules/@napi-rs/canvas*/**/*"]
    },
    serverComponentsExternalPackages: ["@napi-rs/canvas"]
  }
};

module.exports = nextConfig;
