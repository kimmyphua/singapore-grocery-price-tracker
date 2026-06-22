# App Favicon Design

## Goal

Use the supplied grocery-cart artwork as the browser tab icon for the Singapore Grocery Price Tracker.

## Design

- Preserve the supplied 512 x 512 transparent PNG without redrawing or changing its colors.
- Store it at `src/app/icon.png` so the Next.js App Router emits the favicon metadata automatically.
- Do not add manual metadata links or a separate legacy ICO unless browser verification shows they are required.

## Verification

- Add a focused test that confirms the icon exists, is a PNG, and has square dimensions suitable for favicon generation.
- Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate`.
- Push to `main`, wait for CI and the Vercel production deployment, then confirm the production HTML advertises the icon and the icon URL returns an image successfully.
