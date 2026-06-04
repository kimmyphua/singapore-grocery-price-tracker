"use client";

export function FullPageLoadingOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 text-center shadow-lg ring-1 ring-teal/15">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-teal/20 border-t-teal" />
        <p className="mt-4 text-sm font-semibold text-ink">{message}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Keep this tab open while the request finishes.
        </p>
      </div>
    </div>
  );
}
