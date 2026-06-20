import { requireAdminPage } from "@/lib/auth/admin";
import { listRedMartRefreshJobs } from "@/lib/redmart/jobs";
import { RedMartAdminActions } from "./redmart-admin-actions";

export const dynamic = "force-dynamic";

export default async function RedMartAdminPage() {
  await requireAdminPage();
  const jobs = await listRedMartRefreshJobs(undefined, 100);
  const counts = {
    pending: jobs.filter((job) => job.status === "PENDING").length,
    processing: jobs.filter((job) => job.status === "PROCESSING").length,
    completed: jobs.filter((job) => job.status === "COMPLETED").length,
    failed: jobs.filter((job) => job.status === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-peach">Administrator</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">
            RedMart refresh queue
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This page queues work. Run the command on the authorized Mac to
            collect it.
          </p>
          <code className="mt-3 inline-block rounded bg-ink px-3 py-2 text-sm text-white">
            npm run redmart:refresh
          </code>
        </div>
        <RedMartAdminActions />
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Count label="Pending" value={counts.pending} />
        <Count label="Processing" value={counts.processing} />
        <Count label="Completed" value={counts.completed} />
        <Count label="Failed" value={counts.failed} />
      </section>

      <section className="overflow-x-auto rounded-xl border border-teal/15 bg-white shadow-sm">
        {jobs.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">No RedMart jobs yet.</p>
        ) : (
          <table className="min-w-[1000px] w-full text-left text-sm">
            <thead className="border-b border-teal/10 bg-mist/50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Requester</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal/10">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-3">
                    <a
                      href={job.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-ink hover:text-teal"
                    >
                      {job.productTitle}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {job.requesterEmail}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {job.status}
                  </td>
                  <td className="px-4 py-3">{job.attemptCount}</td>
                  <td className="px-4 py-3">{formatDate(job.createdAt)}</td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">
                    {job.failureMessage ??
                      (job.completedAt
                        ? `Completed ${formatDate(job.completedAt)}`
                        : job.claimedAt
                          ? `Claimed ${formatDate(job.claimedAt)}`
                          : "Waiting")}
                  </td>
                  <td className="px-4 py-3">
                    {job.status === "FAILED" ? (
                      <RedMartAdminActions retryJobId={job.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-teal/15 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(value);
}
