export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-600"
    >
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-coral"
      />
      Loading...
    </div>
  );
}
