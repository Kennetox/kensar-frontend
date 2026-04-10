"use client";

import { useSearchParams } from "next/navigation";
import SalesHistoryContent from "../../components/SalesHistoryContent";

export default function SalesHistoryPage() {
  const searchParams = useSearchParams();
  const posPreview = searchParams.get("posPreview") === "1";
  const saleIdParam = searchParams.get("saleId");
  const saleDateParam = searchParams.get("saleDate");
  const termParam = searchParams.get("term");
  const initialSaleId =
    saleIdParam && /^\d+$/.test(saleIdParam)
      ? Number.parseInt(saleIdParam, 10)
      : null;
  const backPath = posPreview ? "/dashboard?posPreview=1" : "/dashboard";
  const salesPath = posPreview
    ? "/dashboard/sales?posPreview=1"
    : "/dashboard/sales";

  return (
    <div className="dashboard-sales-scale">
      <SalesHistoryContent
        backPath={backPath}
        backLabel="Volver"
        returnPath="/pos/devoluciones"
        returnBackPath={salesPath}
        initialSaleId={initialSaleId}
        initialDateKey={saleDateParam}
        initialTerm={termParam}
      />
    </div>
  );
}
