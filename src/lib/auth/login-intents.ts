import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export type LoginIntentDuration = "ONE_DAY" | "THIRTY_DAYS";
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const EMAIL_LOGIN_LIMIT = 3;
export const REQUESTER_LOGIN_LIMIT = 10;
const CONSUMED_INTENT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type LoginIntentStore = {
  reserve(input: {
    nonceHash: string;
    emailHash: string;
    requesterHash: string;
    duration: LoginIntentDuration;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<
    | { created: true }
    | { created: false; reason: "EMAIL_LIMIT" | "REQUESTER_LIMIT" }
  >;
  consume(
    nonceHash: string,
    now: Date
  ): Promise<{ duration: LoginIntentDuration } | null>;
  invalidate(nonceHash: string, now: Date): Promise<void>;
};

export class LoginIntentError extends Error {
  readonly code = "LOGIN_INTENT_INVALID";

  constructor() {
    super("The login link is invalid or has expired.");
    this.name = "LoginIntentError";
  }
}

export class LoginRateLimitError extends Error {
  readonly code = "LOGIN_RATE_LIMITED";

  constructor() {
    super("Too many sign-in attempts. Try again later.");
    this.name = "LoginRateLimitError";
  }
}

const LOGIN_INTENT_LIFETIME_MS = 15 * 60 * 1000;

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export const prismaLoginIntentStore: LoginIntentStore = {
  reserve(input) {
    return prisma.$transaction(async (transaction) => {
      const cleanupBefore = new Date(
        input.createdAt.getTime() - CONSUMED_INTENT_RETENTION_MS
      );
      await transaction.loginIntent.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: input.createdAt } },
            { consumedAt: { lte: cleanupBefore } }
          ]
        }
      });

      for (const key of [input.emailHash, input.requesterHash].sort()) {
        await transaction.$queryRaw`
          SELECT
            pg_advisory_xact_lock(hashtextextended(${key}, 0))
              IS NOT NULL AS locked
        `;
      }

      const windowStart = new Date(
        input.createdAt.getTime() - LOGIN_RATE_LIMIT_WINDOW_MS
      );
      const [emailCount, requesterCount] = await Promise.all([
        transaction.loginIntent.count({
          where: {
            emailHash: input.emailHash,
            createdAt: { gte: windowStart }
          }
        }),
        transaction.loginIntent.count({
          where: {
            requesterHash: input.requesterHash,
            createdAt: { gte: windowStart }
          }
        })
      ]);

      if (emailCount >= EMAIL_LOGIN_LIMIT) {
        return { created: false as const, reason: "EMAIL_LIMIT" as const };
      }
      if (requesterCount >= REQUESTER_LOGIN_LIMIT) {
        return {
          created: false as const,
          reason: "REQUESTER_LIMIT" as const
        };
      }

      await transaction.loginIntent.create({ data: input });
      return { created: true as const };
    });
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
  },
  async invalidate(nonceHash, now) {
    await prisma.loginIntent.updateMany({
      where: { nonceHash, consumedAt: null },
      data: { consumedAt: now }
    });
  }
};

export async function createLoginIntent(
  store: LoginIntentStore,
  duration: LoginIntentDuration,
  identity: { email: string; requesterKey: string },
  now = new Date()
) {
  const nonce = randomBytes(32).toString("base64url");

  const result = await store.reserve({
    nonceHash: hashValue(nonce),
    emailHash: hashValue(identity.email.trim().toLowerCase()),
    requesterHash: hashValue(identity.requesterKey),
    duration,
    expiresAt: new Date(now.getTime() + LOGIN_INTENT_LIFETIME_MS),
    createdAt: now
  });

  if (!result.created) {
    throw new LoginRateLimitError();
  }

  return { nonce };
}

export async function consumeLoginIntent(
  store: LoginIntentStore,
  nonce: string,
  now = new Date()
) {
  const intent = await store.consume(hashValue(nonce), now);

  if (!intent) {
    throw new LoginIntentError();
  }

  return intent;
}

export async function invalidateLoginIntent(
  store: LoginIntentStore,
  nonce: string,
  now = new Date()
) {
  await store.invalidate(hashValue(nonce), now);
}
