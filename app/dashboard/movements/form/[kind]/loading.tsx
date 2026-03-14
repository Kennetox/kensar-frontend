export default function MovementFormLoading() {
  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between gap-3 px-1">
        <div className="space-y-2">
          <div className="h-8 w-72 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-96 animate-pulse rounded-lg bg-slate-200" />
        </div>
        <div className="h-9 w-44 animate-pulse rounded-lg bg-slate-200" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto max-w-3xl space-y-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={`field-skeleton-${index}`} className="space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
            </div>
          ))}
          <div className="flex justify-end">
            <div className="h-10 w-44 animate-pulse rounded-lg bg-slate-200" />
          </div>
        </div>
      </section>
    </div>
  );
}
