"use client";

import React, { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setStatus("saving");
    const { error: updateError } =
      await createSupabaseBrowserClient().auth.updateUser({ password });
    if (updateError) {
      setStatus("idle");
      setError(updateError.message || "The password could not be changed.");
      return;
    }

    setPassword("");
    setConfirmation("");
    setStatus("saved");
  }

  return (
    <form onSubmit={changePassword} className="mt-6 space-y-4 border-t border-sage pt-5">
      <div>
        <h2 className="font-bold text-ink">Change password</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use at least 8 characters for your new password.
        </p>
      </div>
      <label htmlFor="new-password" className="block">
        <span className="text-sm font-bold text-ink">New password</span>
        <input
          id="new-password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-sage px-3 outline-none focus:ring-4 focus:ring-lilac/50"
        />
      </label>
      <label htmlFor="confirm-password" className="block">
        <span className="text-sm font-bold text-ink">
          Confirm new password
        </span>
        <input
          id="confirm-password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-sage px-3 outline-none focus:ring-4 focus:ring-lilac/50"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
      {status === "saved" ? (
        <p role="status" className="text-sm font-semibold text-teal">
          Your password has been changed.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink disabled:opacity-60"
      >
        {status === "saving" ? "Changing..." : "Change password"}
      </button>
    </form>
  );
}
