"use client";

import { useSearchParams } from "next/navigation";
import SalesHistoryContent from "../../components/SalesHistoryContent";

export default function PosSalesHistoryPage() {
  const searchParams = useSearchParams();
  const backParam = searchParams.get("back");
  const returnParam = searchParams.get("returnTo");
  const originParam = searchParams.get("origin");
  const resolvedBackPath = backParam ? decodeURIComponent(backParam) : "/pos";
  const backLabel = backParam ? "Volver" : "Volver al POS";
  const resolvedReturnPath = returnParam
    ? decodeURIComponent(returnParam)
    : undefined;
  const resolvedOriginPath = originParam
    ? decodeURIComponent(originParam)
    : "/pos";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <SalesHistoryContent
        backPath={resolvedBackPath}
        backLabel={backLabel}
        returnPath={resolvedReturnPath}
        returnBackPath={resolvedOriginPath}
      />
    </div>
  );
}
