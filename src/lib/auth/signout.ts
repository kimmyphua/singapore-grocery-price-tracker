import { NextResponse } from "next/server";

type SignOutAuthAdapter = {
  signOut(options: {
    scope: "local";
  }): Promise<{ error?: unknown } | unknown>;
};

export type SignOutDependencies = {
  appOrigin: string;
  auth: SignOutAuthAdapter;
};

export async function handleSignOut(
  _request: Request,
  dependencies: SignOutDependencies
) {
  await dependencies.auth
    .signOut({ scope: "local" })
    .catch(() => undefined);

  return NextResponse.redirect(
    new URL("/login", dependencies.appOrigin),
    303
  );
}
