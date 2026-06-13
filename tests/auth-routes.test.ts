import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type {
  LoginIntentDuration,
  LoginIntentStore
} from "@/lib/auth/login-intents";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn()
}));

vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();
  return {
    ...actual,
    createServerClient: createServerClientMock
  };
});

import {
  getLoginRequestContext,
  sendMagicLink,
  type LoginRequestDependencies
} from "@/lib/auth/login";
import {
  handleAuthCallback,
  type AuthCallbackDependencies
} from "@/lib/auth/callback";
import {
  handleSignOut,
  type SignOutDependencies
} from "@/lib/auth/signout";
import { middleware } from "../middleware";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function createIntentStore(): LoginIntentStore & {
  createdDurations: LoginIntentDuration[];
  invalidated: string[];
} {
  const createdDurations: LoginIntentDuration[] = [];
  const invalidated: string[] = [];

  return {
    createdDurations,
    invalidated,
    async reserve(input) {
      createdDurations.push(input.duration);
      return { created: true };
    },
    async consume() {
      return { duration: createdDurations.at(-1) ?? "ONE_DAY" };
    },
    async invalidate(nonceHash) {
      invalidated.push(nonceHash);
    }
  };
}

describe("login request", () => {
  it("creates a 30-day intent and sends the magic link to the callback", async () => {
    const intents = createIntentStore();
    const signInWithOtp = vi.fn(async () => ({
      data: {},
      error: null
    }));
    const dependencies: LoginRequestDependencies = {
      appOrigin: "https://prices.example",
      requesterKey: "203.0.113.4",
      now: new Date("2026-06-12T00:00:00.000Z"),
      intents,
      auth: { signInWithOtp }
    };

    await expect(
      sendMagicLink(
        {
          email: "  User@Example.com ",
          stayLoggedIn: true
        },
        dependencies
      )
    ).resolves.toEqual({
      status: "sent",
      message: "Check your email for a sign-in link."
    });

    expect(intents.createdDurations).toEqual(["THIRTY_DAYS"]);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "User@example.com",
      options: {
        emailRedirectTo: expect.stringMatching(
          /^https:\/\/prices\.example\/auth\/callback\?intent=[A-Za-z0-9_-]+$/
        )
      }
    });
  });

  it("returns safe validation and rate-limit errors", async () => {
    const signInWithOtp = vi.fn(async () => ({
      data: {},
      error: {
        status: 429,
        message: "provider details must not be returned"
      }
    }));
    const dependencies: LoginRequestDependencies = {
      appOrigin: "https://prices.example",
      requesterKey: "203.0.113.4",
      intents: createIntentStore(),
      auth: { signInWithOtp }
    };

    await expect(
      sendMagicLink(
        { email: "not-an-email", stayLoggedIn: false },
        dependencies
      )
    ).resolves.toEqual({
      status: "error",
      code: "INVALID_INPUT",
      message: "Enter a valid email address."
    });
    await expect(
      sendMagicLink(
        { email: "user@example.com", stayLoggedIn: false },
        dependencies
      )
    ).resolves.toEqual({
      status: "error",
      code: "RATE_LIMITED",
      message: "Too many sign-in attempts. Try again later."
    });
  });

  it("invalidates the reserved intent when Supabase does not send", async () => {
    const intents = createIntentStore();
    const dependencies: LoginRequestDependencies = {
      appOrigin: "https://prices.example",
      requesterKey: "203.0.113.4",
      now: new Date("2026-06-12T00:00:00.000Z"),
      intents,
      auth: {
        signInWithOtp: vi.fn(async () => ({
          data: {},
          error: { status: 503 }
        }))
      }
    };

    await expect(
      sendMagicLink(
        { email: "user@example.com", stayLoggedIn: false },
        dependencies
      )
    ).resolves.toMatchObject({
      status: "error",
      code: "AUTH_UNAVAILABLE"
    });
    expect(intents.invalidated).toHaveLength(1);
  });

  it("uses APP_ORIGIN and ignores poisoned forwarding headers", () => {
    const headers = new Map([
      ["host", "attacker.example"],
      ["x-forwarded-host", "attacker.example"],
      ["x-forwarded-proto", "http"],
      ["x-forwarded-for", "203.0.113.4, 10.0.0.1"]
    ]);

    expect(
      getLoginRequestContext(
        { get: (name) => headers.get(name) ?? null },
        {
          NEXT_PUBLIC_SUPABASE_URL:
            "https://axmooodckwmazabgitkv.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
          APP_ORIGIN: "https://prices.example"
        }
      )
    ).toEqual({
      appOrigin: "https://prices.example",
      requesterKey: "203.0.113.4"
    });
  });
});

describe("auth callback", () => {
  function createDependencies(
    duration: LoginIntentDuration
  ): AuthCallbackDependencies & {
    auth: AuthCallbackDependencies["auth"] & {
      exchangeCodeForSession: ReturnType<typeof vi.fn>;
      verifyOtp: ReturnType<typeof vi.fn>;
    };
    db: AuthCallbackDependencies["db"] & {
      createSession: ReturnType<typeof vi.fn>;
    };
  } {
    return {
      appOrigin: "https://prices.example",
      now: new Date("2026-06-12T00:00:00.000Z"),
      intents: {
        async reserve() {
          return { created: true };
        },
        async consume() {
          return { duration };
        },
        async invalidate() {
          return undefined;
        }
      },
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: {},
          error: null
        })),
        verifyOtp: vi.fn(async () => ({
          data: {},
          error: null
        })),
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: USER_ID,
              email: "user@example.com"
            }
          },
          error: null
        })),
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: USER_ID,
              session_id: SESSION_ID
            }
          },
          error: null
        })),
        signOut: vi.fn(async () => ({ error: null }))
      },
      db: {
        upsertProfile: vi.fn(async () => ({ id: "profile-1" })),
        createSession: vi.fn(async () => undefined)
      }
    };
  }

  it.each([
    ["ONE_DAY", "2026-06-13T00:00:00.000Z"],
    ["THIRTY_DAYS", "2026-07-12T00:00:00.000Z"]
  ] as const)(
    "exchanges the code and creates an exact %s application session",
    async (duration, expectedExpiry) => {
      const dependencies = createDependencies(duration);
      const response = await handleAuthCallback(
        new Request(
          "https://prices.example/auth/callback?token_hash=hashed-token&type=email&intent=opaque-nonce"
        ),
        dependencies
      );

      expect(dependencies.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: "hashed-token",
        type: "email"
      });
      expect(dependencies.db.createSession).toHaveBeenCalledWith({
        profileId: "profile-1",
        supabaseSessionId: SESSION_ID,
        expiresAt: new Date(expectedExpiry)
      });
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://prices.example/");
    }
  );

  it("accepts Supabase's default PKCE magic-link callback", async () => {
    const dependencies = createDependencies("ONE_DAY");
    const response = await handleAuthCallback(
      new Request(
        "https://prices.example/auth/callback?code=pkce-code&intent=opaque-nonce"
      ),
      dependencies
    );

    expect(dependencies.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "pkce-code"
    );
    expect(dependencies.auth.verifyOtp).not.toHaveBeenCalled();
    expect(dependencies.db.createSession).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://prices.example/");
  });

  it("rejects malformed callback payloads without calling Supabase", async () => {
    const dependencies = createDependencies("ONE_DAY");
    const response = await handleAuthCallback(
      new Request("https://prices.example/auth/callback?code=pkce-code"),
      dependencies
    );

    expect(dependencies.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(dependencies.auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://prices.example/login?error=invalid_link"
    );
  });

  it("rejects claims that do not match the verified user", async () => {
    const dependencies = createDependencies("ONE_DAY");
    dependencies.auth.getClaims = vi.fn(async () => ({
      data: {
        claims: {
          sub: "33333333-3333-4333-8333-333333333333",
          session_id: SESSION_ID
        }
      },
      error: null
    }));

    const response = await handleAuthCallback(
      new Request(
        "https://prices.example/auth/callback?token_hash=hashed-token&type=email&intent=opaque-nonce"
      ),
      dependencies
    );

    expect(dependencies.db.createSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://prices.example/login?error=invalid_link"
    );
  });

  it("signs out locally when an exchanged callback has an invalid intent", async () => {
    const dependencies = createDependencies("ONE_DAY");
    dependencies.intents.consume = vi.fn(async () => null);

    const response = await handleAuthCallback(
      new Request(
        "https://prices.example/auth/callback?token_hash=hashed-token&type=email&intent=expired-nonce"
      ),
      dependencies
    );

    expect(dependencies.auth.signOut).toHaveBeenCalledWith({
      scope: "local"
    });
    expect(dependencies.db.createSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://prices.example/login?error=invalid_link"
    );
  });

  it("rejects callback OTP types other than email", async () => {
    const dependencies = createDependencies("ONE_DAY");
    const response = await handleAuthCallback(
      new Request(
        "https://prices.example/auth/callback?token_hash=hashed-token&type=invite&intent=opaque-nonce"
      ),
      dependencies
    );

    expect(dependencies.auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://prices.example/login?error=invalid_link"
    );
  });
});

describe("sign out", () => {
  it("deletes only the current app session and signs out locally", async () => {
    const deleteSession = vi.fn(async () => undefined);
    const signOut = vi.fn(async () => ({ error: null }));
    const dependencies: SignOutDependencies = {
      appOrigin: "https://prices.example",
      auth: {
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              session_id: SESSION_ID
            }
          },
          error: null
        })),
        signOut
      },
      db: { deleteSession }
    };

    const response = await handleSignOut(
      new Request("https://attacker.example/auth/signout", {
        method: "POST",
        headers: { Origin: "https://prices.example" }
      }),
      dependencies
    );

    expect(deleteSession).toHaveBeenCalledWith(SESSION_ID);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://prices.example/login"
    );
  });
});

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://axmooodckwmazabgitkv.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  });

  it("refreshes auth cookies while allowing a signed-in protected request", async () => {
    createServerClientMock.mockImplementation(
      (_url: string, _key: string, options: {
        cookies: {
          setAll(cookies: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>): void;
        };
      }) => ({
        auth: {
          getUser: vi.fn(async () => {
            options.cookies.setAll([
              {
                name: "sb-token",
                value: "refreshed",
                options: { httpOnly: true }
              }
            ]);
            return {
              data: { user: { id: USER_ID } },
              error: null
            };
          })
        }
      })
    );

    const response = await middleware(
      new NextRequest("https://prices.example/products")
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-token")?.value).toBe("refreshed");
  });

  it("redirects signed-out protected requests but permits login and callback", async () => {
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null
        }))
      }
    });

    const protectedResponse = await middleware(
      new NextRequest("https://prices.example/products")
    );
    const loginResponse = await middleware(
      new NextRequest("https://prices.example/login")
    );
    const callbackResponse = await middleware(
      new NextRequest("https://prices.example/auth/callback?code=code")
    );

    expect(protectedResponse.headers.get("location")).toBe(
      "https://prices.example/login"
    );
    expect(loginResponse.headers.get("location")).toBeNull();
    expect(callbackResponse.headers.get("location")).toBeNull();
  });

  it("does not turn middleware provider failures into login redirects", async () => {
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: {
            name: "AuthRetryableFetchError",
            status: 503
          }
        }))
      }
    });

    const response = await middleware(
      new NextRequest("https://prices.example/products")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect signed-out API mutations", async () => {
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null
        }))
      }
    });

    const response = await middleware(
      new NextRequest("https://prices.example/api/prices/refresh", {
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
