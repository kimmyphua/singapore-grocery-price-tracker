import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
  authenticateWithPassword,
  type LoginRequestDependencies
} from "@/lib/auth/login";
import {
  handleSignOut,
  type SignOutDependencies
} from "@/lib/auth/signout";
import { middleware } from "../middleware";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("login request", () => {
  it("signs in with a normalized email and password", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: USER_ID } },
      error: null
    }));
    const dependencies: LoginRequestDependencies = {
      auth: {
        signInWithPassword,
        signUp: vi.fn()
      }
    };

    await expect(
      authenticateWithPassword(
        {
          email: "  User@Example.com ",
          password: "correct horse battery staple",
          mode: "SIGN_IN"
        },
        dependencies
      )
    ).resolves.toEqual({
      status: "authenticated"
    });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "User@example.com",
      password: "correct horse battery staple"
    });
  });

  it("creates an account with email and password", async () => {
    const signUp = vi.fn(async () => ({
      data: {
        user: { id: USER_ID },
        session: { access_token: "access-token" }
      },
      error: null
    }));

    await expect(
      authenticateWithPassword(
        {
          email: "new@example.com",
          password: "a secure password",
          mode: "SIGN_UP"
        },
        {
          auth: {
            signInWithPassword: vi.fn(),
            signUp
          }
        }
      )
    ).resolves.toEqual({
      status: "authenticated"
    });
    expect(signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "a secure password"
    });
  });

  it("returns safe validation and credential errors", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: null },
      error: {
        status: 400,
        code: "invalid_credentials",
        message: "sensitive provider detail"
      }
    }));
    const dependencies: LoginRequestDependencies = {
      auth: {
        signInWithPassword,
        signUp: vi.fn()
      }
    };

    await expect(
      authenticateWithPassword(
        {
          email: "not-an-email",
          password: "short",
          mode: "SIGN_IN"
        },
        dependencies
      )
    ).resolves.toEqual({
      status: "error",
      code: "INVALID_INPUT",
      message: "Enter a valid email and a password of at least 8 characters."
    });
    await expect(
      authenticateWithPassword(
        {
          email: "user@example.com",
          password: "wrong password",
          mode: "SIGN_IN"
        },
        dependencies
      )
    ).resolves.toEqual({
      status: "error",
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect."
    });
  });

  it("reports an existing account safely during sign-up", async () => {
    await expect(
      authenticateWithPassword(
        {
          email: "user@example.com",
          password: "a secure password",
          mode: "SIGN_UP"
        },
        {
          auth: {
            signInWithPassword: vi.fn(),
            signUp: vi.fn(async () => ({
              data: { user: null, session: null },
              error: {
                status: 422,
                code: "user_already_exists",
                message: "provider detail"
              }
            }))
          }
        }
      )
    ).resolves.toEqual({
      status: "error",
      code: "ACCOUNT_EXISTS",
      message: "An account already exists for this email. Sign in instead."
    });
  });

  it("returns a safe provider error", async () => {
    await expect(
      authenticateWithPassword(
        {
          email: "user@example.com",
          password: "a secure password",
          mode: "SIGN_IN"
        },
        {
          auth: {
            signInWithPassword: vi.fn(async () => {
              throw new Error("secret upstream detail");
            }),
            signUp: vi.fn()
          }
        }
      )
    ).resolves.toEqual({
      status: "error",
      code: "AUTH_UNAVAILABLE",
      message: "Sign-in is temporarily unavailable. Try again later."
    });
  });
});

describe("sign out", () => {
  it("signs out locally without custom session cleanup", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const dependencies: SignOutDependencies = {
      appOrigin: "https://prices.example",
      auth: {
        signOut
      }
    };

    const response = await handleSignOut(
      new Request("https://attacker.example/auth/signout", {
        method: "POST",
        headers: { Origin: "https://prices.example" }
      }),
      dependencies
    );

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

  it("redirects signed-out protected requests but permits login", async () => {
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

    expect(protectedResponse.headers.get("location")).toBe(
      "https://prices.example/login"
    );
    expect(loginResponse.headers.get("location")).toBeNull();
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
