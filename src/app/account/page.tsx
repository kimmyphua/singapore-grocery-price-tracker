import { requireProtectedPage } from "@/lib/auth/guards";

export default async function AccountPage() {
  const { profileId, email } = await requireProtectedPage();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-sm font-bold text-peach">Account</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">
          Your tracker account
        </h1>
      </div>
      <section className="rounded-2xl border border-sage bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="mt-1 font-bold text-ink">{email}</p>
        <p className="sr-only">{profileId}</p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button
            type="submit"
            className="rounded-full bg-peach px-5 py-2 text-sm font-bold text-ink"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
