type PosNavigationOverlayProps = {
  title: string;
  detail: string;
};

export function PosNavigationOverlay({
  title,
  detail,
}: PosNavigationOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950 text-slate-100 flex items-center justify-center px-6"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="h-11 w-11 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin"
          aria-hidden="true"
        />
        <div>
          <p className="text-lg font-semibold">{title}</p>
          <p className="mt-1 text-sm text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}
