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

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="stayLoggedIn"
          className="mt-0.5 h-4 w-4 rounded border-teal/30 text-teal"
        />
        <span>
          <span className="font-semibold text-ink">Stay logged in</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            Keep this browser signed in for 30 days instead of 24 hours.
          </span>
        </span>
      </label>

      <SubmitButton />

      {state.status === "sent" ? (
        <p
          role="status"
          className="rounded-md border border-mint/50 bg-mint/15 px-3 py-2 text-sm text-ink"
        >
          {state.message}
        </p>
      ) : null}
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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Sending link..." : "Send magic link"}
    </button>
  );
}
