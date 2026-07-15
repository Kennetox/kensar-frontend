export default function PaymentLoading() {
  return (
    <main
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="h-11 w-11 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin"
          aria-hidden="true"
        />
        <div>
          <p className="text-lg font-semibold">Abriendo pantalla de pago…</p>
          <p className="mt-1 text-sm text-slate-400">
            Tu carrito permanece guardado.
          </p>
        </div>
      </div>
    </main>
  );
}
