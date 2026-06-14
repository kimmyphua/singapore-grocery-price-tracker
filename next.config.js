/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@sparticuz/chromium",
      "playwright-core"
    ]
  }
};

module.exports = nextConfig;
