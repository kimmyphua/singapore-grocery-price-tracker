import { redirect } from "next/navigation";
import {
  authenticateWithPassword,
  type LoginActionState
} from "@/lib/auth/login";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

async function passwordAuthAction(
  _state: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  "use server";

  const supabase = await createSupabaseServerClient();
  const result = await authenticateWithPassword(
    {
      email: formData.get("email"),
      password: formData.get("password"),
      mode: formData.get("mode")
    },
    { auth: supabase.auth }
  );

  if (result.status === "authenticated") {
    redirect("/");
  }

  return result;
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <section className="rounded-lg border border-teal/15 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-teal">Private price tracker</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">
          Sign in or create an account
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Use your email and a password of at least 8 characters.
        </p>
        <LoginForm action={passwordAuthAction} />
      </section>
    </div>
  );
}
