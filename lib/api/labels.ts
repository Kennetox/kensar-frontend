"use client";

import { getApiBase } from "@/lib/api/base";

type LabelExportItemPayload = {
  product_id: number;
  sku: string;
  name: string;
  barcode: string | null;
  price: number;
  quantity: number;
};

/**
 * Genera el Excel para etiquetas y devuelve el blob resultante.
 * El backend debe transformar price a una cadena con "$" como carácter literal,
 * ya que el editor externo no interpreta el formato de moneda de Excel.
 */
export async function exportLabelsExcel(
  items: LabelExportItemPayload[],
  token?: string | null
): Promise<Blob> {
  if (!items.length) {
    throw new Error("No hay productos para exportar.");
  }
  const apiBase = getApiBase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidatePaths = [
    "/labels/export/xlsx",
    "/labels/export-excel",
    "/labels/export",
    "/pos/labels/export",
    "/pos/labels/export-excel",
  ];

  for (const path of candidatePaths) {
    const res = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
      credentials: "include",
    });

    if (res.status === 404) {
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(detail || `Error ${res.status}`);
    }

    return await res.blob();
  }

  throw new Error("No se encontró un endpoint válido para exportar etiquetas.");
}
