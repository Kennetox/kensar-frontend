"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import type { Product as PosProduct } from "../../pos/poscontext";
import { getApiBase } from "@/lib/api/base";
import { printLabelViaCloudProxy } from "@/lib/api/labels";

type ProductSearchResult = Pick<
  PosProduct,
  "id" | "sku" | "name" | "price" | "barcode"
>;

type PrintPayload = {
  CODIGO: string;
  BARRAS: string;
  NOMBRE: string;
  PRECIO: string;
  format: string;
  copies: number;
};

type PrintStatus = "idle" | "printing" | "success" | "error";
type PrintMode = "local" | "cloud";

type LabelItem = {
  productId: number;
  sku: string;
  name: string;
  barcode: string | null;
  price: number;
  quantity: number;
};

const LOCAL_STORAGE_PRINTER_URL = "kensar_labels_pilot_printer_url";
const LOCAL_STORAGE_FORMAT = "kensar_labels_pilot_format";
const LOCAL_STORAGE_PRINT_MODE = "kensar_labels_pilot_print_mode";
const LOCAL_STORAGE_CLOUD_SERIAL = "kensar_labels_pilot_cloud_serial";

const DEFAULT_PRINTER_URL = "http://10.10.20.19:8081";
const DEFAULT_FORMAT = "Kensar";
const DEFAULT_PRINT_MODE: PrintMode = "cloud";
const DEFAULT_CLOUD_SERIAL = "FL206720";
const TEST_LABEL: PrintPayload = {
  CODIGO: "3519",
  BARRAS: "3519",
  NOMBRE: "Microfono Condensador TCM-304",
  PRECIO: "$22.000",
  format: DEFAULT_FORMAT,
  copies: 1,
};

async function printLabelDirect(
  targetUrl: string,
  payload: PrintPayload
): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([payload]),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Error ${res.status}`);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Tiempo de espera agotado (3s).");
    }
    if (err instanceof TypeError) {
      throw new Error("No se pudo conectar a la impresora. Revisa la URL o red.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function LabelsPilotPage() {
  const { token } = useAuth();
  const apiBase = getApiBase();

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  const [printerUrl, setPrinterUrl] = useState(DEFAULT_PRINTER_URL);
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [printMode, setPrintMode] = useState<PrintMode>(DEFAULT_PRINT_MODE);
  const [cloudSerial, setCloudSerial] = useState(DEFAULT_CLOUD_SERIAL);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);

  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [printError, setPrintError] = useState<string | null>(null);
  const [probeStatus, setProbeStatus] = useState<PrintStatus>("idle");
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [bulkPrinting, setBulkPrinting] = useState(false);

  const canUseApi = !!authHeaders;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedPrinterUrl = window.localStorage.getItem(
      LOCAL_STORAGE_PRINTER_URL
    );
    const storedFormat = window.localStorage.getItem(LOCAL_STORAGE_FORMAT);
    const storedCloudSerial = window.localStorage.getItem(
      LOCAL_STORAGE_CLOUD_SERIAL
    );
    if (storedPrinterUrl) setPrinterUrl(storedPrinterUrl);
    if (storedFormat) setFormat(storedFormat);
    if (storedCloudSerial) setCloudSerial(storedCloudSerial);
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsReady) return;
    window.localStorage.setItem(LOCAL_STORAGE_PRINTER_URL, printerUrl);
  }, [printerUrl, settingsReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsReady) return;
    window.localStorage.setItem(LOCAL_STORAGE_FORMAT, format);
  }, [format, settingsReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsReady) return;
    window.localStorage.setItem(LOCAL_STORAGE_PRINT_MODE, printMode);
  }, [printMode, settingsReady]);

  useEffect(() => {
    if (typeof window === "undefined" || !settingsReady) return;
    window.localStorage.setItem(LOCAL_STORAGE_CLOUD_SERIAL, cloudSerial);
  }, [cloudSerial, settingsReady]);

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!canUseApi) return;
      const query = searchQuery.trim();
      if (!query) {
        setSearchResults([]);
        setSearchError(null);
        return;
      }
      try {
        setSearchLoading(true);
        setSearchError(null);

        const params = new URLSearchParams({
          limit: "5000",
        });

        const res = await fetch(`${apiBase}/products/?${params.toString()}`, {
          headers: authHeaders ?? undefined,
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }

        const data: PosProduct[] = await res.json();
        const normalizedQuery = query.toLowerCase();
        const filtered = data
          .filter((product) => product.active)
          .filter((product) => {
            const haystack = [
              product.sku ?? "",
              product.name ?? "",
              product.barcode ?? "",
              String(product.id ?? ""),
            ].map((value) => value.toLowerCase());
            return haystack.some((value) => value.includes(normalizedQuery));
          })
          .slice(0, 120)
          .map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            barcode: product.barcode,
            price: product.price,
          }));
        setSearchResults(filtered);
      } catch (err) {
        console.error("Error al buscar productos para etiquetas", err);
        setSearchError(
          err instanceof Error
            ? err.message
            : "No pudimos buscar productos. Intenta de nuevo."
        );
      } finally {
        setSearchLoading(false);
      }
    },
    [apiBase, authHeaders, canUseApi, searchQuery]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
  }, []);

  const handleAddProduct = useCallback(
    (product: ProductSearchResult) => {
      setLabelItems((prev) => {
        const exists = prev.find((p) => p.productId === product.id);
        if (exists) {
          return prev.map((p) =>
            p.productId === product.id
              ? { ...p, quantity: p.quantity + 1 }
              : p
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku ?? "",
            name: product.name,
            barcode: product.barcode ?? null,
            price: product.price,
            quantity: 1,
          },
        ];
      });
      setActiveItemId(product.id);
    },
    []
  );

  const handleRemoveItem = useCallback((productId: number) => {
    setLabelItems((prev) => prev.filter((p) => p.productId !== productId));
    setActiveItemId((prev) => (prev === productId ? null : prev));
  }, []);

  const handleQuantityChange = useCallback(
    (productId: number, newQuantity: number) => {
      if (Number.isNaN(newQuantity) || newQuantity <= 0) return;
      setLabelItems((prev) =>
        prev.map((p) =>
          p.productId === productId ? { ...p, quantity: newQuantity } : p
        )
      );
    },
    []
  );

  const handleClearList = useCallback(() => {
    setLabelItems([]);
    setActiveItemId(null);
  }, []);

  const formatPriceForPayload = (value: number) => {
    if (Number.isNaN(value)) return "$0";
    return `$${value.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const resolvedTargetUrl = useMemo(() => {
    if (printMode === "cloud") {
      const serial = cloudSerial.trim();
      return serial ? `/labels/cloud/print/${serial}` : "";
    }
    return printerUrl.trim();
  }, [cloudSerial, printMode, printerUrl]);

  const validateTarget = useCallback(() => {
    if (!resolvedTargetUrl) {
      throw new Error(
        printMode === "cloud"
          ? "Completa el serial para EasyPrint Cloud."
          : "Completa Printer URL."
      );
    }
  }, [printMode, resolvedTargetUrl]);

  const sendPrint = useCallback(
    async (payload: PrintPayload) => {
      if (printMode === "cloud") {
        await printLabelViaCloudProxy(cloudSerial, payload, {
          token,
          timeoutMs: 20000,
        });
        return;
      }
      await printLabelDirect(resolvedTargetUrl, payload);
    },
    [
      cloudSerial,
      printMode,
      resolvedTargetUrl,
      token,
    ]
  );

  const buildPayload = useCallback(
    (item: LabelItem): PrintPayload => {
      const codigo = item.sku || String(item.productId);
      const barras = item.barcode || codigo;
      return {
        CODIGO: codigo,
        BARRAS: barras,
        NOMBRE: item.name,
        PRECIO: formatPriceForPayload(item.price),
        format: format.trim() || DEFAULT_FORMAT,
        copies: item.quantity > 0 ? item.quantity : 1,
      };
    },
    [format]
  );

  const handlePrint = useCallback(
    async (item: LabelItem) => {
      const payload = buildPayload(item);
      try {
        validateTarget();
        setPrintStatus("printing");
        setPrintError(null);
        setActiveItemId(item.productId);
        await sendPrint(payload);
        setPrintStatus("success");
      } catch (err) {
        console.error("Error al imprimir etiqueta", err);
        setPrintStatus("error");
        setPrintError(
          err instanceof Error
            ? err.message
            : "No pudimos imprimir la etiqueta."
        );
      }
    },
    [buildPayload, sendPrint, validateTarget]
  );

  const handlePrintAll = useCallback(async () => {
    if (!labelItems.length || bulkPrinting) return;
    try {
      validateTarget();
      setBulkPrinting(true);
      setPrintStatus("printing");
      setPrintError(null);
      for (const item of labelItems) {
        setActiveItemId(item.productId);
        await sendPrint(buildPayload(item));
      }
      setPrintStatus("success");
    } catch (err) {
      console.error("Error al imprimir etiqueta", err);
      setPrintStatus("error");
      setPrintError(
        err instanceof Error
          ? err.message
          : "No pudimos imprimir la etiqueta."
      );
    } finally {
      setBulkPrinting(false);
    }
  }, [
    buildPayload,
    bulkPrinting,
    labelItems,
    sendPrint,
    validateTarget,
  ]);

  const handleProbePrinter = useCallback(async () => {
    try {
      validateTarget();
      setProbeStatus("printing");
      setProbeMessage(null);
      await sendPrint({
        ...TEST_LABEL,
        format: format.trim() || DEFAULT_FORMAT,
      });
      setProbeStatus("success");
      setProbeMessage("Impresion de prueba enviada.");
    } catch (err) {
      console.error("Error al probar la impresora", err);
      setProbeStatus("error");
      setProbeMessage(
        err instanceof Error
          ? err.message
          : "No pudimos enviar la impresion de prueba."
      );
    }
  }, [format, sendPrint, validateTarget]);

  return (
    <main className="flex-1 px-6 py-6 dashboard-theme text-slate-900">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
            Etiquetado (beta)
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Impresion directa SATO
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Piloto temporal para imprimir etiquetas con SATO FX3-LX via Easy
            Impresion (SEPL) usando JSON directo desde el navegador.
          </p>
        </header>

        <section className="rounded-3xl ui-surface p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Modo:</span>{" "}
              {printMode === "cloud" ? "EasyPrint Cloud" : "Local / Agente"} ·{" "}
              <span className="font-semibold">Format:</span> {format}
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              {settingsOpen ? "Ocultar configuración" : "Mostrar configuración"}
            </button>
          </div>

          {settingsOpen && (
            <div className="grid gap-4 md:grid-cols-3 border-t border-slate-200 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Modo
                </label>
              <select
                className="ui-input w-full px-3 py-2 text-sm"
                value={printMode}
                disabled
              >
                <option value="cloud">EasyPrint Cloud</option>
              </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">
                  Printer URL
                </label>
                <input
                  className="ui-input w-full px-3 py-2 text-sm"
                  value={printerUrl}
                  onChange={(e) => setPrinterUrl(e.target.value)}
                  placeholder="http://10.10.20.19:8081"
                  disabled={printMode === "cloud"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  Format
                </label>
                <input
                  className="ui-input w-full px-3 py-2 text-sm"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  placeholder="Kensar"
                />
              </div>
              {printMode === "cloud" && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Serial
                    </label>
                    <input
                      className="ui-input w-full px-3 py-2 text-sm"
                      value={cloudSerial}
                      onChange={(e) => setCloudSerial(e.target.value)}
                      placeholder={DEFAULT_CLOUD_SERIAL}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      X-CLIENT-KEY se toma desde el backend (
                      <span className="font-mono">SATO_CLOUD_CLIENT_KEY</span>).
                    </div>
                  </div>
                </>
              )}
              <div className="md:col-span-3 flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl border border-emerald-500 bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60"
                onClick={handleProbePrinter}
                disabled={probeStatus === "printing"}
              >
                {probeStatus === "printing"
                  ? "Probando..."
                  : "Probar conexion (imprimir test)"}
              </button>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    probeStatus === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : probeStatus === "error"
                      ? "bg-rose-100 text-rose-700"
                      : probeStatus === "printing"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {probeStatus === "success"
                  ? "exito"
                  : probeStatus === "error"
                  ? "error"
                  : probeStatus === "printing"
                  ? "imprimiendo"
                  : "inactivo"}
              </span>
                {probeMessage && (
                  <span className="text-sm text-slate-600">{probeMessage}</span>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-600 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            Endpoint actual (modo activo):{" "}
            <span className="font-mono">{resolvedTargetUrl || "sin definir"}</span>
          </div>
        </section>

        <section className="rounded-3xl ui-surface p-5 md:p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Buscar producto
              </h2>
              <p className="text-sm text-slate-600">
                Busca por nombre, codigo, SKU o codigo de barras.
              </p>
            </div>
            <form
              onSubmit={handleSearch}
              className="flex flex-col gap-3 md:flex-row md:items-center"
            >
              <div className="flex-1">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">
                    Buscar por nombre, codigo o SKU
                  </span>
                  <input
                    className="ui-input w-full px-3 py-2 text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ej. HDMI, 3280, cable plug..."
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
                  disabled={searchLoading || !canUseApi}
                >
                  {searchLoading ? "Buscando..." : "Buscar"}
                </button>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </form>
            {searchError && (
              <div className="text-sm text-rose-600">{searchError}</div>
            )}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 text-xs text-slate-600">
                <span>
                  Resultados de la busqueda{" "}
                  {searchResults.length > 0 &&
                    `· ${searchResults.length.toLocaleString("es-CO")} producto${
                      searchResults.length !== 1 ? "s" : ""
                    }`}
                </span>
                <span className="text-[11px]">
                  Doble clic para agregar a la lista de impresion
                </span>
              </div>
              <div className="max-h-80 overflow-auto text-sm">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 w-24 text-center">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {searchResults.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-slate-500 text-sm"
                        >
                          No hay resultados. Escribe un termino de busqueda y
                          presiona “Buscar”.
                        </td>
                      </tr>
                    ) : (
                      searchResults.map((product) => (
                        <tr
                          key={product.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onDoubleClick={() => handleAddProduct(product)}
                        >
                          <td className="px-3 py-2 text-slate-600">
                            {product.sku || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-800">
                            {product.name}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-800">
                            {formatPriceForPayload(product.price)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddProduct(product);
                              }}
                              className="px-2.5 py-1.5 rounded-md text-xs border border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                            >
                              Agregar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl ui-surface p-5 md:p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Lista de impresion
                </h2>
                <p className="text-sm text-slate-600">
                  Agrega productos, ajusta las copias y envia a la impresora.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintAll}
                  disabled={!labelItems.length || bulkPrinting}
                  className="px-3 py-1.5 rounded-md border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                  {bulkPrinting ? "Imprimiendo todo..." : "Imprimir todo"}
                </button>
                <button
                  type="button"
                  onClick={handleClearList}
                  disabled={!labelItems.length}
                  className="px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  Limpiar lista
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 text-xs text-slate-600">
                <span>
                  Productos en la lista ·{" "}
                  {labelItems.length.toLocaleString("es-CO")}
                </span>
                <span className="text-[11px]">Selecciona un producto para imprimir.</span>
              </div>
              <div className="max-h-80 overflow-auto text-sm">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 w-24 text-center">Copias</th>
                      <th className="px-3 py-2 w-28 text-center">Accion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {labelItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-slate-500 text-sm"
                        >
                          Aun no hay productos en la lista.
                        </td>
                      </tr>
                    ) : (
                      labelItems.map((item) => (
                        <tr
                          key={item.productId}
                          className={`cursor-pointer ${
                            activeItemId === item.productId
                              ? "bg-emerald-50"
                              : "hover:bg-slate-50"
                          }`}
                          onClick={() => setActiveItemId(item.productId)}
                        >
                          <td className="px-3 py-2 text-slate-600">
                            {item.sku || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-800">
                            {item.name}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-800">
                            {formatPriceForPayload(item.price)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min={1}
                              className="ui-input w-20 px-2 py-1 text-xs text-center"
                              value={item.quantity}
                              onChange={(e) =>
                                handleQuantityChange(
                                  item.productId,
                                  Number(e.target.value)
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md text-xs border border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrint(item);
                                }}
                                disabled={printStatus === "printing"}
                              >
                                Imprimir
                              </button>
                              <button
                                type="button"
                                className="px-2.5 py-1.5 rounded-md text-xs border border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveItem(item.productId);
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {printStatus !== "idle" && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    printStatus === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : printStatus === "error"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {printStatus === "success"
                    ? "exito"
                    : printStatus === "error"
                    ? "error"
                    : "imprimiendo"}
                </span>
              )}
              {printError && (
                <span className="text-sm text-rose-600">{printError}</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
