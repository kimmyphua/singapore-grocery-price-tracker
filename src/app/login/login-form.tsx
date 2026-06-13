"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { LoginActionState } from "@/lib/auth/login";

type LoginFormProps = {
  action: (
    state: LoginActionState,
    formData: FormData
  ) => Promise<LoginActionState>;
  initialState?: LoginActionState;
};

export function LoginForm({
  action,
  initialState = { status: "idle" }
}: LoginFormProps) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <label className="block">
        <span className="text-sm font-semibold text-ink">Email address</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className="mt-2 h-11 w-full rounded-md border border-teal/25 bg-white px-3 text-sm text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/15"
          placeholder="you@example.com"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-ink">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          minLength={8}
          required
          className="mt-2 h-11 w-full rounded-md border border-teal/25 bg-white px-3 text-sm text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/15"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <SubmitButton mode="SIGN_IN">Sign in</SubmitButton>
        <SubmitButton mode="SIGN_UP">Create account</SubmitButton>
      </div>

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-berry/25 bg-berry/10 px-3 py-2 text-sm text-berry"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({
  mode,
  children
}: {
  mode: "SIGN_IN" | "SIGN_UP";
  children: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="mode"
      value={mode}
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Please wait..." : children}
    </button>
  );
}
