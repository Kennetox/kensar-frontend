import { getApiBase } from "@/lib/api/base";

export type OperationSourceLine = {
  source_type: "sale" | "change";
  source_item_id: number;
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_barcode?: string | null;
  quantity: number;
  consumed_quantity: number;
  available_quantity: number;
  unit_value: number;
};

export type OperationChainEntry = {
  document_type: "sale" | "change" | "return";
  document_id: number;
  document_number: string;
  status: string;
  created_at: string;
};

export type OperationDocument = {
  document_type: "sale" | "change" | "return";
  document_id: number;
  document_number: string;
  status: string;
  root_sale_id: number;
  root_sale_document_number: string;
  source_document_number?: string | null;
  items: OperationSourceLine[];
  chain: OperationChainEntry[];
  allowed_actions: Array<"change" | "return">;
};

export async function resolveOperationDocument(
  code: string,
  authHeaders: HeadersInit
): Promise<OperationDocument> {
  const response = await fetch(
    `${getApiBase()}/pos/operation-documents/resolve?code=${encodeURIComponent(code)}`,
    { headers: authHeaders, credentials: "include", cache: "no-store" }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail ?? "Documento no encontrado.");
  }
  return response.json() as Promise<OperationDocument>;
}
