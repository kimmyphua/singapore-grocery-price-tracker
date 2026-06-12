import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  consumeLoginIntent,
  createLoginIntent,
  type LoginIntentDuration,
  type LoginIntentStore
} from "@/lib/auth/login-intents";

type StoredIntent = {
  nonceHash: string;
  duration: LoginIntentDuration;
  expiresAt: Date;
  consumedAt: Date | null;
};

function createFakeStore(): LoginIntentStore & {
  intents: Map<string, StoredIntent>;
} {
  const intents = new Map<string, StoredIntent>();

  return {
    intents,
    async create(input) {
      intents.set(input.nonceHash, {
        ...input,
        consumedAt: null
      });
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
    }
  };
}

describe("login intents", () => {
  it("stores only a SHA-256 hash of a 32-byte opaque nonce", async () => {
    const store = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");

    const created = await createLoginIntent(store, "ONE_DAY", now);
    const nonceBytes = Buffer.from(created.nonce, "base64url");
    const expectedHash = createHash("sha256")
      .update(created.nonce)
      .digest("hex");

    expect(nonceBytes).toHaveLength(32);
    expect(store.intents.has(created.nonce)).toBe(false);
    expect(store.intents.get(expectedHash)).toEqual({
      nonceHash: expectedHash,
      duration: "ONE_DAY",
      expiresAt: new Date("2026-06-12T00:15:00.000Z"),
      consumedAt: null
    });
  });

  it("consumes a 30-day login intent only once", async () => {
    const store = createFakeStore();
    const now = new Date("2026-06-12T00:00:00.000Z");
    const created = await createLoginIntent(store, "THIRTY_DAYS", now);

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
    const created = await createLoginIntent(store, "ONE_DAY", now);
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
});
