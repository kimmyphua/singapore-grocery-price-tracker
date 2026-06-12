import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const runIntegration = databaseUrl ? describe : describe.skip;

function requireLocalDatabaseUrl(): string {
  if (!databaseUrl) {
    throw new Error("MIGRATION_TEST_DATABASE_URL is required");
  }

  const parsedUrl = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
    throw new Error(
      "Migration behavior tests only run against a loopback PostgreSQL host",
    );
  }

  parsedUrl.searchParams.delete("schema");
  return parsedUrl.toString();
}

runIntegration("multi-user migration behavior", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(requireLocalDatabaseUrl(), {
      max: 1,
      prepare: false,
    });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("enforces RLS, indexes, and retailer-listing consistency", async () => {
    const privateTables = [
      "UserProfile",
      "LoginIntent",
      "AppSession",
      "TrackedProduct",
      "TrackedProductListing",
      "ScrapeAttempt",
    ];

    const rlsTables = await sql<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ${sql(privateTables)}
        AND c.relrowsecurity
      ORDER BY c.relname
    `;
    expect(rlsTables.map(({ relname }) => relname)).toEqual(
      [...privateTables].sort(),
    );

    const [{ policyCount }] = await sql<{ policyCount: number }[]>`
      SELECT count(*)::int AS "policyCount"
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ${sql(privateTables)}
    `;
    expect(policyCount).toBe(0);

    const expectedIndexes = [
      "LoginIntent_emailHash_createdAt_idx",
      "LoginIntent_requesterHash_createdAt_idx",
      "RetailerListing_id_retailerId_key",
      "TrackedProductListing_retailerId_idx",
    ];
    const indexes = await sql<{ indexdef: string; indexname: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ${sql(expectedIndexes)}
      ORDER BY indexname
    `;
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      [...expectedIndexes].sort(),
    );
    const indexDefinitions = new Map(
      indexes.map(({ indexdef, indexname }) => [indexname, indexdef]),
    );
    expect(
      indexDefinitions.get("RetailerListing_id_retailerId_key"),
    ).toContain("CREATE UNIQUE INDEX");
    expect(
      indexDefinitions.get("RetailerListing_id_retailerId_key"),
    ).toContain('(id, "retailerId")');
    expect(
      indexDefinitions.get("TrackedProductListing_retailerId_idx"),
    ).toContain('("retailerId")');
    expect(
      indexDefinitions.get("LoginIntent_emailHash_createdAt_idx"),
    ).toContain('("emailHash", "createdAt")');
    expect(
      indexDefinitions.get("LoginIntent_requesterHash_createdAt_idx"),
    ).toContain('("requesterHash", "createdAt")');

    const suffix = randomUUID();
    const profileId = `profile-${suffix}`;
    const trackedProductId = `product-${suffix}`;
    const retailerAId = `retailer-a-${suffix}`;
    const retailerBId = `retailer-b-${suffix}`;
    const listingId = `listing-${suffix}`;
    const rollback = new Error("rollback integration fixtures");

    await expect(
      sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO "Retailer" (id, slug, name, "baseUrl", "updatedAt")
          VALUES
            (${retailerAId}, ${retailerAId}, 'Retailer A', 'https://a.example', CURRENT_TIMESTAMP),
            (${retailerBId}, ${retailerBId}, 'Retailer B', 'https://b.example', CURRENT_TIMESTAMP)
        `;
        await transaction`
          INSERT INTO "UserProfile" (id, "supabaseUserId", email, "updatedAt")
          VALUES (${profileId}, ${randomUUID()}, ${`${suffix}@example.com`}, CURRENT_TIMESTAMP)
        `;
        await transaction`
          INSERT INTO "TrackedProduct" (
            id, "ownerId", slug, name, brand, family,
            "packCount", "unitSize", unit, "totalSize", "updatedAt"
          )
          VALUES (
            ${trackedProductId}, ${profileId}, ${trackedProductId},
            'Product', 'Brand', 'Family', 1, 1, 'kg', 1, CURRENT_TIMESTAMP
          )
        `;
        await transaction`
          INSERT INTO "RetailerListing" (
            id, "retailerId", "titleRaw", "productUrl", "updatedAt"
          )
          VALUES (
            ${listingId}, ${retailerAId}, 'Listing',
            ${`https://a.example/${listingId}`}, CURRENT_TIMESTAMP
          )
        `;

        await expect(
          transaction`
            INSERT INTO "TrackedProductListing" (
              id, "trackedProductId", "retailerListingId", "retailerId"
            )
            VALUES (
              ${`link-${suffix}`}, ${trackedProductId}, ${listingId}, ${retailerBId}
            )
          `,
        ).rejects.toMatchObject({
          code: "23503",
          constraint_name:
            "TrackedProductListing_retailerListingId_retailerId_fkey",
        });

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
