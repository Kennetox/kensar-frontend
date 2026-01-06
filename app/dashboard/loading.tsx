export default function DashboardLoading() {
  const cards = Array.from({ length: 3 });
  const tableRows = Array.from({ length: 4 });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="hidden md:flex md:flex-col w-64 border-r border-slate-900 bg-slate-950/90">
        <div className="h-16 border-b border-slate-900 flex items-center px-5">
          <div className="h-6 w-32 rounded-md bg-slate-800 animate-pulse" />
        </div>
        <div className="flex-1 space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-9 rounded-lg bg-slate-900 animate-pulse" />
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-slate-900 bg-slate-950/80 backdrop-blur flex items-center px-6">
          <div className="h-4 w-48 rounded bg-slate-900 animate-pulse" />
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((_, idx) => (
              <div
                key={idx}
                className="h-32 rounded-2xl border border-slate-900 bg-slate-950/70 animate-pulse"
              />
            ))}
          </div>

          <div className="rounded-3xl border border-slate-900 bg-slate-950/70 p-6 space-y-4">
            <div className="h-6 w-56 rounded bg-slate-900 animate-pulse" />
            <div className="space-y-3">
              {tableRows.map((_, idx) => (
                <div key={idx} className="h-12 rounded-xl bg-slate-900/80 animate-pulse" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
