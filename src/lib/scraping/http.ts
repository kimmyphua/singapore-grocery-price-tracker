const DEFAULT_DELAY_MS = Number(process.env.SCRAPER_MIN_DELAY_MS ?? "2000");

export async function fetchRetailerPage(url: string): Promise<string> {
  await delay(DEFAULT_DELAY_MS);

  const response = await fetch(url, {
    headers: {
      "user-agent":
        process.env.SCRAPER_USER_AGENT ??
        "SingaporeGroceryPriceTracker/0.1 contact=configure@example.com",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Retailer request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
