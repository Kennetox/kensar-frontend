"use client";

import { useSearchParams } from "next/navigation";
import DocumentsExplorer from "../../components/DocumentsExplorer";

export default function PosDocumentsPage() {
  const searchParams = useSearchParams();
  const backParam = searchParams.get("back");
  const resolvedBackPath = backParam ? decodeURIComponent(backParam) : "/pos";
  const backLabel = backParam ? "Volver" : "Volver al POS";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="px-4 py-6 max-w-7xl mx-auto">
        <DocumentsExplorer
          backPath={resolvedBackPath}
          backLabel={backLabel}
          hideManageCustomers
        />
      </div>
    </div>
  );
}
