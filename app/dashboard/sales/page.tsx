"use client";

import { useSearchParams } from "next/navigation";
import SalesHistoryContent from "../../components/SalesHistoryContent";

export default function SalesHistoryPage() {
  const searchParams = useSearchParams();
  const posPreview = searchParams.get("posPreview") === "1";
  const backPath = posPreview ? "/dashboard?posPreview=1" : "/dashboard";
  const salesPath = posPreview
    ? "/dashboard/sales?posPreview=1"
    : "/dashboard/sales";

  return (
    <SalesHistoryContent
      backPath={backPath}
      backLabel="Volver"
      returnPath="/pos/devoluciones"
      returnBackPath={salesPath}
    />
  );
}
