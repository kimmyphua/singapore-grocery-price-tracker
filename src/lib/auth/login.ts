import { z } from "zod";

export type LoginActionState =
  | { status: "idle" }
  | { status: "authenticated" }
  | {
      status: "error";
      code:
        | "INVALID_INPUT"
        | "INVALID_CREDENTIALS"
        | "ACCOUNT_EXISTS"
        | "AUTH_UNAVAILABLE";
      message: string;
    };

type PasswordAuthResult = {
  data: {
    user: unknown;
    session?: unknown;
  };
  error: unknown;
};

type LoginAuthAdapter = {
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<PasswordAuthResult>;
  signUp(input: {
    email: string;
    password: string;
  }): Promise<PasswordAuthResult>;
};

export type LoginRequestDependencies = {
  auth: LoginAuthAdapter;
};

const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => {
      const at = email.lastIndexOf("@");
      return `${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}`;
    }),
  password: z.string().min(8).max(72),
  mode: z.enum(["SIGN_IN", "SIGN_UP"])
});

const providerErrorSchema = z.object({
  code: z.string().optional()
});

export async function authenticateWithPassword(
  input: unknown,
  dependencies: LoginRequestDependencies
): Promise<LoginActionState> {
  const payload = loginRequestSchema.safeParse(input);

  if (!payload.success) {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "Enter a valid email and a password of at least 8 characters."
    };
  }

  try {
    const credentials = {
      email: payload.data.email,
      password: payload.data.password
    };
    const result =
      payload.data.mode === "SIGN_UP"
        ? await dependencies.auth.signUp(credentials)
        : await dependencies.auth.signInWithPassword(credentials);

    if (result.error) {
      const providerError = providerErrorSchema.safeParse(result.error);
      const code = providerError.success
        ? providerError.data.code
        : undefined;

      if (code === "invalid_credentials") {
        return {
          status: "error",
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect."
        };
      }

      if (code === "user_already_exists") {
        return {
          status: "error",
          code: "ACCOUNT_EXISTS",
          message: "An account already exists for this email. Sign in instead."
        };
      }

      return authUnavailableState();
    }

    if (!result.data.user) {
      return authUnavailableState();
    }

    return { status: "authenticated" };
  } catch {
    return authUnavailableState();
  }
}

export function authUnavailableState(): LoginActionState {
  return {
    status: "error",
    code: "AUTH_UNAVAILABLE",
    message: "Sign-in is temporarily unavailable. Try again later."
  };
}
