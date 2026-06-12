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
  sendMagicLink,
  type LoginRequestDependencies
} from "@/app/login/page";
import {
  handleAuthCallback,
  type AuthCallbackDependencies
} from "@/app/auth/callback/route";
import {
  handleSignOut,
  type SignOutDependencies
} from "@/app/auth/signout/route";
import { middleware } from "../middleware";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function createIntentStore(): LoginIntentStore & {
  createdDurations: LoginIntentDuration[];
} {
  const createdDurations: LoginIntentDuration[] = [];

  return {
    createdDurations,
    async create(input) {
      createdDurations.push(input.duration);
    },
    async consume() {
      return { duration: createdDurations.at(-1) ?? "ONE_DAY" };
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
      origin: "https://prices.example",
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
      origin: "https://prices.example",
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
});

describe("auth callback", () => {
  function createDependencies(
    duration: LoginIntentDuration
  ): AuthCallbackDependencies & {
    auth: AuthCallbackDependencies["auth"] & {
      exchangeCodeForSession: ReturnType<typeof vi.fn>;
    };
    db: AuthCallbackDependencies["db"] & {
      createSession: ReturnType<typeof vi.fn>;
    };
  } {
    return {
      now: new Date("2026-06-12T00:00:00.000Z"),
      intents: {
        async create() {},
        async consume() {
          return { duration };
        }
      },
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
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
          "https://prices.example/auth/callback?code=pkce-code&intent=opaque-nonce"
        ),
        dependencies
      );

      expect(dependencies.auth.exchangeCodeForSession).toHaveBeenCalledWith(
        "pkce-code"
      );
      expect(dependencies.db.createSession).toHaveBeenCalledWith({
        profileId: "profile-1",
        supabaseSessionId: SESSION_ID,
        expiresAt: new Date(expectedExpiry)
      });
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://prices.example/");
    }
  );

  it("rejects malformed callback payloads without calling Supabase", async () => {
    const dependencies = createDependencies("ONE_DAY");
    const response = await handleAuthCallback(
      new Request("https://prices.example/auth/callback?code=pkce-code"),
      dependencies
    );

    expect(dependencies.auth.exchangeCodeForSession).not.toHaveBeenCalled();
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
        "https://prices.example/auth/callback?code=pkce-code&intent=opaque-nonce"
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
        "https://prices.example/auth/callback?code=pkce-code&intent=expired-nonce"
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
});

describe("sign out", () => {
  it("deletes only the current app session and signs out locally", async () => {
    const deleteSession = vi.fn(async () => undefined);
    const signOut = vi.fn(async () => ({ error: null }));
    const dependencies: SignOutDependencies = {
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
      new Request("https://prices.example/auth/signout", { method: "POST" }),
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
});
