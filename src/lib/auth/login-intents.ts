import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export type LoginIntentDuration = "ONE_DAY" | "THIRTY_DAYS";

export type LoginIntentStore = {
  create(input: {
    nonceHash: string;
    duration: LoginIntentDuration;
    expiresAt: Date;
  }): Promise<void>;
  consume(
    nonceHash: string,
    now: Date
  ): Promise<{ duration: LoginIntentDuration } | null>;
};

export class LoginIntentError extends Error {
  readonly code = "LOGIN_INTENT_INVALID";

  constructor() {
    super("The login link is invalid or has expired.");
    this.name = "LoginIntentError";
  }
}

const LOGIN_INTENT_LIFETIME_MS = 15 * 60 * 1000;

function hashNonce(nonce: string) {
  return createHash("sha256").update(nonce).digest("hex");
}

export const prismaLoginIntentStore: LoginIntentStore = {
  async create(input) {
    await prisma.loginIntent.create({ data: input });
  },
  consume(nonceHash, now) {
    return prisma.$transaction(async (transaction) => {
      const consumed = await transaction.loginIntent.updateMany({
        where: {
          nonceHash,
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: { consumedAt: now }
      });

      if (consumed.count !== 1) {
        return null;
      }

      return transaction.loginIntent.findUnique({
        where: { nonceHash },
        select: { duration: true }
      });
    });
  }
};

export async function createLoginIntent(
  store: LoginIntentStore,
  duration: LoginIntentDuration,
  now = new Date()
) {
  const nonce = randomBytes(32).toString("base64url");

  await store.create({
    nonceHash: hashNonce(nonce),
    duration,
    expiresAt: new Date(now.getTime() + LOGIN_INTENT_LIFETIME_MS)
  });

  return { nonce };
}

export async function consumeLoginIntent(
  store: LoginIntentStore,
  nonce: string,
  now = new Date()
) {
  const intent = await store.consume(hashNonce(nonce), now);

  if (!intent) {
    throw new LoginIntentError();
  }

  return intent;
}
