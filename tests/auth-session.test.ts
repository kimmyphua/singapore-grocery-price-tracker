import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthApiError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError
} from "@supabase/auth-js";

const { cookieStore, createBrowserClientMock, createServerClientMock } = vi.hoisted(
  () => ({
    cookieStore: {
      getAll: vi.fn(),
      set: vi.fn()
    },
    createBrowserClientMock: vi.fn(),
    createServerClientMock: vi.fn()
  })
);

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
  createServerClient: createServerClientMock
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => cookieStore)
}));

import { requireAppSession } from "@/lib/auth/session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function createAuth(overrides: Record<string, unknown> = {}) {
  return {
    getUser: vi.fn(async () => ({
      data: {
        user: {
          id: USER_ID,
          email: "User@Example.com"
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
    signOut: vi.fn(async () => ({ error: null })),
    ...overrides
  };
}

function createDb(overrides: Record<string, unknown> = {}) {
  return {
    upsertProfile: vi.fn(async () => ({ id: "profile-1" })),
    findSession: vi.fn(async () => ({
      profileId: "profile-1",
      expiresAt: new Date("2026-06-12T01:00:00Z")
    })),
    ...overrides
  };
}

describe("Supabase client factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://axmooodckwmazabgitkv.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  });

  it("creates the browser client from public Supabase settings", () => {
    const expectedClient = { kind: "browser" };
    createBrowserClientMock.mockReturnValue(expectedClient);

    expect(createSupabaseBrowserClient()).toBe(expectedClient);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "https://axmooodckwmazabgitkv.supabase.co",
      "publishable"
    );
  });

  it("creates a server client with read/write cookie adapters", async () => {
    const expectedClient = { kind: "server" };
    const existingCookies = [{ name: "sb-token", value: "old" }];
    cookieStore.getAll.mockReturnValue(existingCookies);
    createServerClientMock.mockReturnValue(expectedClient);

    expect(await createSupabaseServerClient()).toBe(expectedClient);

    const options = createServerClientMock.mock.calls[0]?.[2];
    expect(options.cookies.getAll()).toEqual(existingCookies);

    options.cookies.setAll([
      {
        name: "sb-token",
        value: "new",
        options: { httpOnly: true }
      }
    ]);

    expect(cookieStore.set).toHaveBeenCalledWith("sb-token", "new", {
      httpOnly: true
    });
  });

  it("ignores cookie writes rejected by a read-only Server Component store", async () => {
    cookieStore.getAll.mockReturnValue([]);
    cookieStore.set.mockImplementation(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler."
      );
    });
    createServerClientMock.mockReturnValue({ kind: "server" });

    await createSupabaseServerClient();
    const options = createServerClientMock.mock.calls[0]?.[2];

    expect(() =>
      options.cookies.setAll([
        {
          name: "sb-token",
          value: "refreshed",
          options: { httpOnly: true }
        }
      ])
    ).not.toThrow();
    expect(cookieStore.set).toHaveBeenCalledOnce();
  });
});

describe("requireAppSession", () => {
  it("returns an AuthContext from verified identity and claims", async () => {
    const auth = createAuth();
    const db = createDb();

    await expect(
      requireAppSession({
        now: new Date("2026-06-12T00:00:00Z"),
        auth,
        db
      })
    ).resolves.toEqual({
      profileId: "profile-1",
      supabaseUserId: USER_ID,
      email: "User@Example.com",
      supabaseSessionId: SESSION_ID
    });

    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(auth.getClaims).toHaveBeenCalledOnce();
    expect(db.upsertProfile).toHaveBeenCalledWith({
      supabaseUserId: USER_ID,
      email: "User@Example.com"
    });
    expect(db.findSession).toHaveBeenCalledWith(SESSION_ID);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("rejects a missing authenticated user with a typed error", async () => {
    const auth = createAuth({
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: new AuthSessionMissingError()
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      name: "AuthSessionError",
      code: "SESSION_MISSING"
    });
    expect(auth.getClaims).not.toHaveBeenCalled();
  });

  it("treats an absent user without an auth error as a missing session", async () => {
    const auth = createAuth({
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: null
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      code: "SESSION_MISSING"
    });
  });

  it("treats a rejected access token as an invalid session", async () => {
    const auth = createAuth({
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: new AuthApiError("JWT expired", 401, "bad_jwt")
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      code: "SESSION_INVALID"
    });
  });

  it("treats a rejected verified JWT as an invalid session", async () => {
    const auth = createAuth({
      getClaims: vi.fn(async () => ({
        data: null,
        error: new AuthInvalidJwtError("Invalid JWT signature")
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      code: "SESSION_INVALID"
    });
  });

  it("reports returned provider failures without leaking provider details", async () => {
    const auth = createAuth({
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: new AuthRetryableFetchError(
          "upstream secret response body",
          503
        )
      }))
    });

    const error = await requireAppSession({
      auth,
      db: createDb()
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: "AuthSessionError",
      code: "SESSION_PROVIDER_ERROR",
      message: "The authentication provider is temporarily unavailable.",
      cause: {
        name: "AuthRetryableFetchError",
        status: 503
      }
    });
    expect(JSON.stringify(error)).not.toContain("upstream secret");
  });

  it("reports thrown provider failures with a sanitized cause", async () => {
    const auth = createAuth({
      getUser: vi.fn(async () => {
        throw new TypeError("fetch failed for bearer secret-token");
      })
    });

    const error = await requireAppSession({
      auth,
      db: createDb()
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "SESSION_PROVIDER_ERROR",
      cause: {
        name: "TypeError"
      }
    });
    expect(error).not.toHaveProperty("cause.message");
    expect(JSON.stringify(error)).not.toContain("secret-token");
  });

  it("reports claims transport failures as provider errors", async () => {
    const auth = createAuth({
      getClaims: vi.fn(async () => ({
        data: null,
        error: new AuthApiError(
          "service unavailable with sensitive details",
          502,
          "bad_gateway"
        )
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      code: "SESSION_PROVIDER_ERROR",
      cause: {
        name: "AuthApiError",
        status: 502,
        code: "bad_gateway"
      }
    });
  });

  it.each([
    {
      name: "missing session_id",
      claims: { sub: USER_ID }
    },
    {
      name: "malformed session_id",
      claims: { sub: USER_ID, session_id: "client-supplied-value" }
    },
    {
      name: "a subject that differs from the verified user",
      claims: {
        sub: "33333333-3333-4333-8333-333333333333",
        session_id: SESSION_ID
      }
    }
  ])("rejects verified claims with $name", async ({ claims }) => {
    const auth = createAuth({
      getClaims: vi.fn(async () => ({
        data: { claims },
        error: null
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      code: "SESSION_INVALID"
    });
  });

  it("rejects a user without a verified email", async () => {
    const auth = createAuth({
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID } },
        error: null
      }))
    });

    await expect(
      requireAppSession({ auth, db: createDb() })
    ).rejects.toMatchObject({
      code: "SESSION_INVALID"
    });
  });

  it("rejects an application session that does not exist", async () => {
    const db = createDb({
      findSession: vi.fn(async () => null)
    });

    await expect(
      requireAppSession({ auth: createAuth(), db })
    ).rejects.toMatchObject({
      code: "SESSION_INVALID"
    });
  });

  it("rejects an application session owned by another profile", async () => {
    const db = createDb({
      findSession: vi.fn(async () => ({
        profileId: "profile-2",
        expiresAt: new Date("2026-06-12T01:00:00Z")
      }))
    });

    await expect(
      requireAppSession({ auth: createAuth(), db })
    ).rejects.toMatchObject({
      code: "SESSION_INVALID"
    });
  });

  it("rejects an expired application session and signs out locally", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const auth = createAuth({ signOut });
    const db = createDb({
      findSession: vi.fn(async () => ({
        profileId: "profile-1",
        expiresAt: new Date("2026-06-11T23:59:59Z")
      }))
    });

    await expect(
      requireAppSession({
        now: new Date("2026-06-12T00:00:00Z"),
        auth,
        db
      })
    ).rejects.toMatchObject({
      code: "SESSION_EXPIRED"
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("preserves the typed expiry error when local sign-out fails", async () => {
    const signOut = vi.fn(async () => {
      throw new Error("Cookie store is read-only");
    });
    const auth = createAuth({ signOut });
    const db = createDb({
      findSession: vi.fn(async () => ({
        profileId: "profile-1",
        expiresAt: new Date("2026-06-12T00:00:00Z")
      }))
    });

    await expect(
      requireAppSession({
        now: new Date("2026-06-12T00:00:00Z"),
        auth,
        db
      })
    ).rejects.toMatchObject({
      code: "SESSION_EXPIRED"
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
