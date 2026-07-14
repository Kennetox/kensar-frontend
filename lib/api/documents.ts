import { getApiBase } from "@/lib/api/base";

export type DocumentSearchItem = {
  id: string;
  type: "venta" | "orden_web" | "devolucion" | "cambio" | "cierre" | "abono" | "recepcion" | "movimiento_manual" | "recuento";
  record_id: number;
  sale_id?: number | null;
  occurred_at: string;
  document_number: string;
  reference: string;
  detail: string;
  total: number;
  payment_method?: string | null;
  payment_stage?: "initial" | "posterior" | null;
  is_separated: boolean;
  customer?: string | null;
  pos?: string | null;
  vendor?: string | null;
  status?: string | null;
  payment_status?: string | null;
  closure_id?: number | null;
  source_system: string;
};

export type DocumentSearchPage = {
  items: DocumentSearchItem[];
  skip: number;
  limit: number;
  has_more: boolean;
};

export async function searchDocuments(
  token: string,
  filters: {
    type: string;
    dateFrom?: string;
    dateTo?: string;
    term?: string;
    paymentMethod?: string;
    customer?: string;
    pos?: string;
    vendor?: string;
    skip?: number;
    limit?: number;
  },
  signal?: AbortSignal
): Promise<DocumentSearchPage> {
  const params = new URLSearchParams({ type: filters.type });
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.term?.trim()) params.set("term", filters.term.trim());
  if (filters.paymentMethod) params.set("payment_method", filters.paymentMethod);
  if (filters.customer?.trim()) params.set("customer", filters.customer.trim());
  if (filters.pos) params.set("pos", filters.pos);
  if (filters.vendor) params.set("vendor", filters.vendor);
  params.set("skip", String(filters.skip ?? 0));
  params.set("limit", String(filters.limit ?? 50));
  const res = await fetch(`${getApiBase()}/documents/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    signal,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail ?? `Error ${res.status}`);
  }
  return res.json();
}
