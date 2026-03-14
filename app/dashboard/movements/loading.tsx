export default function MovementsLoading() {
  return (
    <div className="space-y-4">
      <section className="h-10 w-72 animate-pulse rounded-lg bg-slate-200" />

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`tab-skeleton-${index}`}
              className="h-9 w-28 animate-pulse rounded-xl bg-slate-200"
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`kpi-skeleton-${index}`}
            className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="h-[420px] animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="h-[420px] animate-pulse rounded-xl border border-slate-200 bg-white" />
      </section>
    </div>
  );
}
