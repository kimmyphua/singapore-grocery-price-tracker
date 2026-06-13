import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMAIL_LOGIN_LIMIT,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  REQUESTER_LOGIN_LIMIT,
  consumeLoginIntent,
  createLoginIntent,
  invalidateLoginIntent,
  type LoginIntentDuration,
  type LoginIntentStore
} from "@/lib/auth/login-intents";

type StoredIntent = {
  nonceHash: string;
  duration: LoginIntentDuration;
  emailHash: string;
  requesterHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

function createFakeStore(): LoginIntentStore & {
  intents: Map<string, StoredIntent>;
} {
  const intents = new Map<string, StoredIntent>();

  return {
    intents,
    async reserve(input) {
      const windowStart = new Date(
        input.createdAt.getTime() - LOGIN_RATE_LIMIT_WINDOW_MS
      );
      const active = [...intents.values()].filter(
        (intent) => intent.createdAt.getTime() >= windowStart.getTime()
      );
      if (
        active.filter((intent) => intent.emailHash === input.emailHash)
          .length >= EMAIL_LOGIN_LIMIT
      ) {
        return { created: false, reason: "EMAIL_LIMIT" as const };
      }
      if (
        active.filter(
          (intent) => intent.requesterHash === input.requesterHash
        ).length >= REQUESTER_LOGIN_LIMIT
      ) {
        return { created: false, reason: "REQUESTER_LIMIT" as const };
      }
      intents.set(input.nonceHash, {
        ...input,
        consumedAt: null
      });
      return { created: true as const };
    },
    async consume(nonceHash, now) {
      const intent = intents.get(nonceHash);

      if (
        !intent ||
        intent.consumedAt !== null ||
        intent.expiresAt.getTime() <= now.getTime()
      ) {
        return null;
      }

      intent.consumedAt = now;
      return { duration: intent.duration };
    },
    async invalidate(nonceHash, now) {
      const intent = intents.get(nonceHash);
      if (intent) {
        intent.consumedAt = now;
      }
    }
  };
}

describe("login intents", () => {
  it("casts advisory lock results to a Prisma-supported scalar", () => {
    const source = readFileSync(
      "src/lib/auth/login-intents.ts",
      "utf8"
    );

    expect(source).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(\$\{key\}, 0\)\)\s+IS NOT NULL AS locked/
    );
  });

  it("stores only a SHA-256 hash of a 32-byte opaque nonce", async () => {
    const store = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");

    const created = await createLoginIntent(
      store,
      "ONE_DAY",
      {
        email: " User@Example.com ",
        requesterKey: "203.0.113.4"
      },
      now
    );
    const nonceBytes = Buffer.from(created.nonce, "base64url");
    const expectedHash = createHash("sha256")
      .update(created.nonce)
      .digest("hex");

    expect(nonceBytes).toHaveLength(32);
    expect(store.intents.has(created.nonce)).toBe(false);
    expect(store.intents.get(expectedHash)).toEqual({
      nonceHash: expectedHash,
      duration: "ONE_DAY",
      emailHash: createHash("sha256")
        .update("user@example.com")
        .digest("hex"),
      requesterHash: createHash("sha256")
        .update("203.0.113.4")
        .digest("hex"),
      expiresAt: new Date("2026-06-12T00:15:00.000Z"),
      createdAt: now,
      consumedAt: null
    });
  });

  it("consumes a 30-day login intent only once", async () => {
    const store = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");
    const created = await createLoginIntent(
      store,
      "THIRTY_DAYS",
      { email: "user@example.com", requesterKey: "requester" },
      now
    );

    await expect(
      consumeLoginIntent(store, created.nonce, now)
    ).resolves.toEqual({
      duration: "THIRTY_DAYS"
    });
    await expect(
      consumeLoginIntent(store, created.nonce, now)
    ).rejects.toMatchObject({
      name: "LoginIntentError",
      code: "LOGIN_INTENT_INVALID"
    });
  });

  it("rejects expired and unknown intents with the same safe error", async () => {
    const store = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");
    const created = await createLoginIntent(
      store,
      "ONE_DAY",
      { email: "user@example.com", requesterKey: "requester" },
      now
    );
    const expiredAt = new Date("2026-06-12T00:15:00.000Z");

    await expect(
      consumeLoginIntent(store, created.nonce, expiredAt)
    ).rejects.toMatchObject({
      code: "LOGIN_INTENT_INVALID",
      message: "The login link is invalid or has expired."
    });
    await expect(
      consumeLoginIntent(store, "unknown-nonce", now)
    ).rejects.toMatchObject({
      code: "LOGIN_INTENT_INVALID",
      message: "The login link is invalid or has expired."
    });
  });

  it("enforces conservative rolling limits per email and requester", async () => {
    const emailStore = createFakeStore();
    const requesterStore = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");

    for (let index = 0; index < EMAIL_LOGIN_LIMIT; index += 1) {
      await createLoginIntent(
        emailStore,
        "ONE_DAY",
        {
          email: "user@example.com",
          requesterKey: `requester-${index}`
        },
        now
      );
    }
    await expect(
      createLoginIntent(
        emailStore,
        "ONE_DAY",
        {
          email: "USER@example.com",
          requesterKey: "different-requester"
        },
        now
      )
    ).rejects.toMatchObject({ code: "LOGIN_RATE_LIMITED" });

    for (let index = 0; index < REQUESTER_LOGIN_LIMIT; index += 1) {
      await createLoginIntent(
        requesterStore,
        "ONE_DAY",
        {
          email: `user-${index}@example.com`,
          requesterKey: "shared-requester"
        },
        now
      );
    }
    await expect(
      createLoginIntent(
        requesterStore,
        "ONE_DAY",
        {
          email: "another@example.com",
          requesterKey: "shared-requester"
        },
        now
      )
    ).rejects.toMatchObject({ code: "LOGIN_RATE_LIMITED" });
  });

  it("marks a failed-send intent consumed so it cannot be used", async () => {
    const store = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");
    const created = await createLoginIntent(
      store,
      "ONE_DAY",
      { email: "user@example.com", requesterKey: "requester" },
      now
    );

    await invalidateLoginIntent(store, created.nonce, now);

    await expect(
      consumeLoginIntent(store, created.nonce, now)
    ).rejects.toMatchObject({ code: "LOGIN_INTENT_INVALID" });
  });
});
