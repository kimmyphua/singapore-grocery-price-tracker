// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordForm } from "@/app/account/password-form";

const { updateUserMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn()
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { updateUser: updateUserMock }
  })
}));

describe("PasswordForm", () => {
  afterEach(() => {
    cleanup();
    updateUserMock.mockReset();
  });

  it("requires matching passwords before updating Supabase", async () => {
    render(<PasswordForm />);
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-123" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("The passwords do not match.")
    ).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("updates the signed-in user's password", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    render(<PasswordForm />);
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-123" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password-123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({
        password: "new-password-123"
      });
    });
    expect(
      screen.getByText("Your password has been changed.")
    ).toBeInTheDocument();
  });
});
