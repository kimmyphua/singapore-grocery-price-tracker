# Agent Instructions

## Project Intent

This repo tracks Singapore supermarket prices for a small recurring basket. Keep reliability and explainability ahead of catalogue breadth.

## Coding Rules

- Use TypeScript and keep strict types.
- Keep scraper logic behind retailer adapters.
- Store raw retailer output separately from canonical product records.
- Do not silently auto-merge fuzzy product matches.
- Prefer small, testable functions for normalization and matching.
- Avoid broad refactors unless they directly support the requested change.

## Scraping Rules

- Use public pages only.
- Do not implement login, cart scraping, account-specific pricing, CAPTCHA bypassing, or anti-bot workarounds.
- Use low scrape frequency and a clear user agent.
- Record scrape failures instead of hiding them.
- Verify selectors against live pages before claiming a retailer adapter works.
- Treat Foodpanda/Giant bot-protection responses as a blocked scrape, not as a reason to add bypass logic.

## Testing Rules

- Add or update tests for normalization, matching, and scraper parsing behavior.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate` before claiming completion.

## Deployment Rules

- Assume Vercel for the Next.js app.
- Assume hosted Postgres for production.
- Use GitHub Actions for scheduled scraping after secrets and selectors are configured.
