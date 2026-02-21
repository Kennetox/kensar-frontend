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

type LabelCloudPrintPayload = {
  CODIGO: string;
  BARRAS: string;
  NOMBRE: string;
  PRECIO: string;
  format: string;
  copies: number;
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

export async function printLabelViaCloudProxy(
  serial: string,
  payload: LabelCloudPrintPayload,
  options?: {
    token?: string | null;
    timeoutMs?: number;
  }
): Promise<void> {
  const serialValue = serial.trim();
  if (!serialValue) {
    throw new Error("Falta el serial de la impresora.");
  }

  const apiBase = getApiBase();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? 20000
  );

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options?.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const res = await fetch(
      `${apiBase}/labels/cloud/print/${encodeURIComponent(serialValue)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          payload,
          fire_and_forget: false,
        }),
        credentials: "include",
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const detail = await extractErrorDetail(res);
      throw new Error(detail || `Error ${res.status}`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Tiempo de espera agotado al contactar SATO Cloud.");
    }
    if (err instanceof TypeError) {
      throw new Error("No se pudo conectar al backend para imprimir.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function extractErrorDetail(res: Response): Promise<string> {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      if (typeof data?.detail === "string" && data.detail.trim()) {
        return data.detail.trim();
      }
      return JSON.stringify(data);
    }
    return (await res.text()).trim();
  } catch {
    return "";
  }
}
