import { parseSupportedProductUrl } from "@/lib/products/url-policy";

type FetchRetailerPageOptions = {
  delayMs?: number;
};

export async function fetchRetailerPage(
  url: string,
  options: FetchRetailerPageOptions = {}
): Promise<string> {
  const initial = parseSupportedProductUrl(url);
  let currentUrl = initial.canonicalUrl;

  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    await delay(options.delayMs ?? getDelayMs());

    const response = await fetch(currentUrl, {
      headers: {
        "user-agent":
          process.env.SCRAPER_USER_AGENT ??
          "SingaporeGroceryPriceTracker/0.1 contact=configure@example.com",
        accept: "text/html,application/xhtml+xml"
      },
      redirect: "manual"
    });

    if (isRedirect(response.status)) {
      if (redirectCount === 2) {
        throw new Error("TOO_MANY_REDIRECTS");
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error("INVALID_REDIRECT");
      }

      const destination = parseSupportedProductUrl(
        new URL(location, currentUrl).toString()
      );
      if (destination.retailerSlug !== initial.retailerSlug) {
        throw new Error("UNSUPPORTED_REDIRECT");
      }

      currentUrl = destination.canonicalUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Retailer request failed: ${response.status} ${response.statusText}`
      );
    }

    return response.text();
  }

  throw new Error("TOO_MANY_REDIRECTS");
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDelayMs(): number {
  return Number(process.env.SCRAPER_MIN_DELAY_MS ?? "2000");
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}
