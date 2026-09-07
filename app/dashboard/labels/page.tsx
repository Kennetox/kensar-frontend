"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import type { Product as PosProduct } from "../../pos/poscontext";
import { getApiBase } from "@/lib/api/base";
import { exportLabelsExcel } from "@/lib/api/labels";
import {
  fetchReceivingLotDetail,
  fetchReceivingLots,
  type ReceivingLotDetail,
  type ReceivingLotRead,
} from "@/lib/api/inventory";
import { formatBogotaDate } from "@/lib/time/bogota";

type ProductSearchResult = Pick<
  PosProduct,
  "id" | "sku" | "name" | "price" | "barcode"
>;

type LabelItem = {
  productId: number;
  sku: string;
  name: string;
  barcode: string | null;
  price: number; // guardamos número; el backend generará "$" como carácter normal
  quantity: number;
};

const LOCAL_STORAGE_KEY = "kensar_labels_items";
const LOCAL_STORAGE_SEARCH_KEY = "kensar_labels_search";
const HIGH_QUANTITY_WARNING_THRESHOLD = 20;

export default function LabelsPage() {
  const { token } = useAuth();
  const apiBase = getApiBase();

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);

  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [labelStateReady, setLabelStateReady] = useState(false);
  const [searchStateReady, setSearchStateReady] = useState(false);
  const [recentReceivingLots, setRecentReceivingLots] = useState<ReceivingLotRead[]>([]);
  const [receivingLotsLoading, setReceivingLotsLoading] = useState(false);
  const [receivingLotsError, setReceivingLotsError] = useState<string | null>(null);
  const [receivingDetails, setReceivingDetails] = useState<Record<number, ReceivingLotDetail>>({});
  const [receivingActionLotId, setReceivingActionLotId] = useState<number | null>(null);
  const [previewLot, setPreviewLot] = useState<ReceivingLotRead | null>(null);
  const [loadedReceivingLotIds, setLoadedReceivingLotIds] = useState<number[]>([]);
  const [receivingMessage, setReceivingMessage] = useState<string | null>(null);
  const [exportWarningOpen, setExportWarningOpen] = useState(false);

  const canUseApi = !!authHeaders;

  const loadRecentReceivingLots = useCallback(async () => {
    if (!token) return;
    try {
      setReceivingLotsLoading(true);
      setReceivingLotsError(null);
      const page = await fetchReceivingLots(token, {
        status: "closed",
        limit: 5,
      });
      const sorted = [...page.items].sort((a, b) => {
        const aTime = new Date(a.closed_at ?? a.updated_at ?? a.created_at).getTime();
        const bTime = new Date(b.closed_at ?? b.updated_at ?? b.created_at).getTime();
        return bTime - aTime;
      });
      setRecentReceivingLots(sorted.slice(0, 5));
    } catch (err) {
      console.error("Error al cargar recepciones recientes", err);
      setReceivingLotsError(
        err instanceof Error ? err.message : "No pudimos cargar las recepciones recientes."
      );
    } finally {
      setReceivingLotsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRecentReceivingLots();
  }, [loadRecentReceivingLots]);

  const getReceivingDetail = useCallback(
    async (lot: ReceivingLotRead) => {
      const cached = receivingDetails[lot.id];
      if (cached) return cached;
      if (!token) throw new Error("Inicia sesión para consultar la recepción.");
      setReceivingActionLotId(lot.id);
      setReceivingLotsError(null);
      try {
        const detail = await fetchReceivingLotDetail(token, lot.id);
        setReceivingDetails((prev) => ({ ...prev, [lot.id]: detail }));
        return detail;
      } finally {
        setReceivingActionLotId((current) => (current === lot.id ? null : current));
      }
    },
    [receivingDetails, token]
  );

  const appendReceivingDetail = useCallback((detail: ReceivingLotDetail) => {
    const validItems = detail.items.filter(
      (item) => item.product_id > 0 && Number(item.qty_received) > 0
    );
    if (!validItems.length) {
      setReceivingLotsError("Esta recepción no tiene productos con cantidades para etiquetar.");
      return false;
    }
    setLabelItems((prev) => {
      const next = [...prev];
      validItems.forEach((item) => {
        const quantity = Math.max(1, Math.round(Number(item.qty_received) || 0));
        const existingIndex = next.findIndex(
          (labelItem) => labelItem.productId === item.product_id
        );
        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + quantity,
          };
          return;
        }
        next.push({
          productId: item.product_id,
          sku: item.sku_snapshot ?? "",
          name: item.product_name_snapshot,
          barcode: item.barcode_snapshot ?? "",
          price: Number(item.unit_price_snapshot) || 0,
          quantity,
        });
      });
      return next;
    });
    setLoadedReceivingLotIds((prev) =>
      prev.includes(detail.lot.id) ? prev : [...prev, detail.lot.id]
    );
    setReceivingMessage(
      `${detail.lot.lot_number}: ${validItems.length.toLocaleString("es-CO")} referencia${
        validItems.length === 1 ? "" : "s"
      } agregada${validItems.length === 1 ? "" : "s"}.`
    );
    setReceivingLotsError(null);
    return true;
  }, []);

  const handlePreviewReceivingLot = useCallback(
    async (lot: ReceivingLotRead) => {
      setPreviewLot(lot);
      setReceivingLotsError(null);
      try {
        await getReceivingDetail(lot);
      } catch (err) {
        console.error("Error al cargar el detalle de la recepción", err);
        setReceivingLotsError(
          err instanceof Error ? err.message : "No pudimos abrir esta recepción."
        );
      }
    },
    [getReceivingDetail]
  );

  const handleLoadReceivingLot = useCallback(
    async (lot: ReceivingLotRead, closePreview = false) => {
      try {
        const detail = await getReceivingDetail(lot);
        const loaded = appendReceivingDetail(detail);
        if (loaded && closePreview) setPreviewLot(null);
      } catch (err) {
        console.error("Error al cargar la recepción en etiquetas", err);
        setReceivingLotsError(
          err instanceof Error ? err.message : "No pudimos cargar esta recepción."
        );
      }
    },
    [appendReceivingDetail, getReceivingDetail]
  );

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

        const pageSize = 5000;
        let skip = 0;
        const data: PosProduct[] = [];

        while (true) {
          const params = new URLSearchParams({
            limit: String(pageSize),
            skip: String(skip),
          });

          const res = await fetch(`${apiBase}/products/?${params.toString()}`, {
            headers: authHeaders ?? undefined,
            credentials: "include",
          });

          if (!res.ok) {
            throw new Error(`Error ${res.status}`);
          }

          const batch: PosProduct[] = await res.json();
          data.push(...batch);

          if (batch.length < pageSize) {
            break;
          }
          skip += pageSize;
        }

        const normalizedQuery = query.toLowerCase();
        const filtered = data
          .filter((product) => {
            const haystack = [
              product.sku ?? "",
              product.name ?? "",
              product.barcode ?? "",
            ].map((value) => value.toLowerCase());
            return haystack.some((value) =>
              value.includes(normalizedQuery)
            );
          })
          .sort((a, b) => {
            const score = (product: PosProduct) => {
              const sku = (product.sku ?? "").toLowerCase();
              const barcode = (product.barcode ?? "").toLowerCase();
              const name = (product.name ?? "").toLowerCase();

              if (sku === normalizedQuery) return 0;
              if (barcode === normalizedQuery) return 1;
              if (sku.startsWith(normalizedQuery)) return 2;
              if (barcode.startsWith(normalizedQuery)) return 3;
              if (sku.includes(normalizedQuery)) return 4;
              if (barcode.includes(normalizedQuery)) return 5;
              if (name.includes(normalizedQuery)) return 6;
              return 7;
            };

            return score(a) - score(b);
          })
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
            barcode: product.barcode ?? "",
            price: product.price,
            quantity: 1,
          },
        ];
      });
    },
    []
  );

  const handleRemoveItem = useCallback((productId: number) => {
    setLabelItems((prev) => prev.filter((p) => p.productId !== productId));
    setReceivingMessage(null);
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

  const handleIncrement = useCallback((productId: number) => {
    setLabelItems((prev) =>
      prev.map((p) =>
        p.productId === productId ? { ...p, quantity: p.quantity + 1 } : p
      )
    );
  }, []);

  const handleDecrement = useCallback((productId: number) => {
    setLabelItems((prev) =>
      prev.map((p) =>
        p.productId === productId
          ? { ...p, quantity: Math.max(1, p.quantity - 1) }
          : p
      )
    );
  }, []);

  const handleClearList = useCallback(() => {
    setLabelItems([]);
    setExportError(null);
    setLoadedReceivingLotIds([]);
    setReceivingMessage(null);
    setExportWarningOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LabelItem[];
        if (Array.isArray(parsed) && parsed.length) {
          setLabelItems(parsed);
        }
      }
    } catch (err) {
      console.warn("No se pudieron restaurar las etiquetas guardadas", err);
    } finally {
      setLabelStateReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !labelStateReady) return;
    if (!labelItems.length) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(labelItems)
    );
  }, [labelItems, labelStateReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_SEARCH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          query?: string;
          results?: ProductSearchResult[];
        };
        if (typeof parsed.query === "string") {
          setSearchQuery(parsed.query);
        }
        if (Array.isArray(parsed.results)) {
          setSearchResults(parsed.results);
        }
      }
    } catch (err) {
      console.warn("No se pudo restaurar la búsqueda de etiquetas", err);
    } finally {
      setSearchStateReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !searchStateReady) return;
    if (!searchQuery && !searchResults.length) {
      window.localStorage.removeItem(LOCAL_STORAGE_SEARCH_KEY);
      return;
    }
    window.localStorage.setItem(
      LOCAL_STORAGE_SEARCH_KEY,
      JSON.stringify({ query: searchQuery, results: searchResults })
    );
  }, [searchQuery, searchResults, searchStateReady]);

  const totalLabels = useMemo(
    () => labelItems.reduce((sum, item) => sum + item.quantity, 0),
    [labelItems]
  );
  const highQuantityItems = useMemo(
    () =>
      labelItems.filter(
        (item) => item.quantity >= HIGH_QUANTITY_WARNING_THRESHOLD
      ),
    [labelItems]
  );


  const formatPriceForUi = (value: number) => {
    if (Number.isNaN(value)) return "$0";
    // Importante: esto es solo visual.
    // El backend debe generar el Excel con el símbolo "$" como carácter normal,
    // no como formato de moneda.
    return `$${value.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const performExport = useCallback(async () => {
    if (!canUseApi || !labelItems.length) return;
    try {
      setExportLoading(true);
      setExportError(null);

      // IMPORTANTE PARA EL BACKEND:
      // - items[i].price se envía como número.
      // - En el Excel, el backend debe transformar ese número a un string
      //   como "$39.000" (no formato de moneda), porque el programa de etiquetas
      //   no reconoce bien el formato de moneda.
      const payloadItems = labelItems.map((item) => ({
        product_id: item.productId,
        sku: item.sku,
        name: item.name,
        barcode: item.barcode,
        price: item.price,
        quantity: item.quantity,
      }));

      const blob = await exportLabelsExcel(payloadItems, token);
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options?: {
            suggestedName?: string;
            types?: { description?: string; accept?: Record<string, string[]> }[];
          }) => Promise<{
            createWritable: () => Promise<{
              write: (data: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }
      ).showSaveFilePicker;

      if (picker) {
        try {
          const handle = await picker({
            suggestedName: "ListaEtiquetas.xlsx",
            types: [
              {
                description: "Excel",
                accept: {
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                    [".xlsx"],
                },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          throw err;
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ListaEtiquetas.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error al exportar etiquetas a Excel", err);
      setExportError(
        err instanceof Error
          ? err.message
          : "No pudimos generar el archivo de etiquetas."
      );
    } finally {
      setExportLoading(false);
    }
  }, [canUseApi, labelItems, token]);

  const handleExport = useCallback(() => {
    if (highQuantityItems.length > 0) {
      setExportWarningOpen(true);
      return;
    }
    void performExport();
  }, [highQuantityItems.length, performExport]);

  useEffect(() => {
    if (!previewLot && !exportWarningOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPreviewLot(null);
      setExportWarningOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exportWarningOpen, previewLot]);

  const previewDetail = previewLot ? receivingDetails[previewLot.id] ?? null : null;
  const previewReferenceCount = previewDetail?.items.length ?? 0;
  const previewUnitsTotal =
    previewDetail?.items.reduce(
      (sum, item) => sum + Number(item.qty_received || 0),
      0
    ) ?? 0;

  return (
    <main className="flex-1 px-6 py-4 dashboard-theme text-slate-900">
      <div className="labels-workspace-scale w-full max-w-[1480px] mx-auto space-y-4">
        {/* Encabezado principal */}
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
            Panel Metrik
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Etiquetas</h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Construye rápidamente una lista de productos para etiquetar y
            genera el archivo de Excel compatible.
          </p>
        </header>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
        {/* Bloque 1: búsqueda de productos */}
        <section className="labels-panel rounded-2xl ui-surface p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Buscar producto
                </h2>
                <p className="text-sm text-slate-600">
                  Escribe parte del nombre o el código del producto y agrega los
                  resultados a la lista de etiquetas.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSearch}
              className="flex flex-col gap-3 md:flex-row md:items-center"
            >
              <div className="flex-1">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">
                    Buscar por nombre, código o SKU
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ej. HDMI, 3280, cable plug..."
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={searchLoading || !canUseApi}
                  className="px-4 py-2 rounded-md text-sm font-semibold border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searchLoading ? "Buscando..." : "Buscar"}
                </button>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2 rounded-md text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  Limpiar
                </button>
              </div>
            </form>

            {searchError && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {searchError}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 text-xs text-slate-600">
                <span>
                  Resultados de la búsqueda{" "}
                  {searchResults.length > 0 &&
                    `· ${searchResults.length.toLocaleString("es-CO")} producto${
                      searchResults.length !== 1 ? "s" : ""
                    }`}
                </span>
                <span className="text-[11px]">
                  Doble clic en un producto para agregarlo a la lista
                </span>
              </div>
              <div className="max-h-72 overflow-auto text-sm">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 w-24 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {searchResults.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-slate-500 text-sm"
                        >
                          No hay resultados. Escribe un término de búsqueda y
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
                            {formatPriceForUi(product.price)}
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

        {/* Bloque 2: lista de productos a etiquetar */}
        <section className="labels-panel rounded-2xl ui-surface p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Lista de productos para etiquetar
                </h2>
                <p className="text-sm text-slate-600">
                  Ajusta las cantidades y genera el archivo de Excel compatible
                  con tu editor de etiquetas actual.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleClearList}
                  disabled={!labelItems.length}
                  className="px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Limpiar lista
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!labelItems.length || exportLoading || !canUseApi}
                  className="px-3 py-1.5 rounded-md border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exportLoading ? "Generando archivo..." : "Exportar a Excel"}
                </button>
              </div>
            </div>

            {exportError && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {exportError}
              </div>
            )}
            {highQuantityItems.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span aria-hidden="true">⚠</span>
                <span>
                  Revisa {highQuantityItems.length} línea
                  {highQuantityItems.length === 1 ? "" : "s"} con 20 o más etiquetas antes de exportar.
                </span>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 text-xs text-slate-600">
                <span>
                  Productos en la lista · {labelItems.length.toLocaleString("es-CO")}{" "}
                  referencia
                  {labelItems.length !== 1 ? "s" : ""} ·{" "}
                  {totalLabels.toLocaleString("es-CO")} etiqueta
                  {totalLabels !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="max-h-72 overflow-auto text-sm">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-center w-32">Precio</th>
                      <th className="px-3 py-2 text-center w-40">Código de barras</th>
                      <th className="px-3 py-2 text-center w-40">Cantidad</th>
                      <th className="px-3 py-2 text-center w-20">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {labelItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-6 text-center text-slate-500 text-sm"
                        >
                          La lista está vacía. Agrega productos desde la búsqueda
                          superior.
                        </td>
                      </tr>
                    ) : (
                      labelItems.map((item) => (
                        <tr key={item.productId} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-600">
                            {item.sku || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-800">{item.name}</td>
                          <td className="px-3 py-2 text-center text-slate-800">
                            {formatPriceForUi(item.price)}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-800">
                            {item.barcode || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDecrement(item.productId)}
                                  className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleQuantityChange(
                                      item.productId,
                                      Number(e.target.value)
                                    )
                                  }
                                  className={`w-16 rounded-md border bg-white px-2 py-1 text-center text-slate-700 ${
                                    item.quantity >= HIGH_QUANTITY_WARNING_THRESHOLD
                                      ? "border-amber-400 ring-1 ring-amber-200"
                                      : "border-slate-300"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleIncrement(item.productId)}
                                  className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                                >
                                  +
                                </button>
                              </div>
                              {item.quantity >= HIGH_QUANTITY_WARNING_THRESHOLD && (
                                <span className="text-[10px] font-semibold text-amber-700">
                                  Cantidad elevada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.productId)}
                              className="px-2 py-1.5 rounded-md text-xs border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Nota: el archivo de Excel generado mantiene la estructura
              compatible con el editor de etiquetas actual. El precio se exporta
              con el signo de pesos como carácter normal (ej.
              <strong>$39.000</strong>) para que el programa lo interprete
              correctamente.
            </p>
          </div>
        </section>
          </div>

          <aside className="labels-panel rounded-2xl ui-surface p-3 xl:sticky xl:top-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Últimas recepciones
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Cinco recepciones cerradas recientes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadRecentReceivingLots()}
                disabled={receivingLotsLoading || !canUseApi}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                title="Actualizar recepciones"
              >
                {receivingLotsLoading ? "Cargando…" : "Actualizar"}
              </button>
            </div>

            {receivingMessage && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {receivingMessage}
              </div>
            )}
            {receivingLotsError && !previewLot && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {receivingLotsError}
              </div>
            )}

            <div className="mt-2 space-y-1.5">
              {!receivingLotsLoading && recentReceivingLots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                  No hay recepciones completadas para mostrar.
                </div>
              ) : (
                recentReceivingLots.map((lot) => {
                  const cachedDetail = receivingDetails[lot.id];
                  const receptionQuantities = new Map<number, number>();
                  cachedDetail?.items.forEach((item) => {
                    const quantity = Math.max(
                      1,
                      Math.round(Number(item.qty_received) || 0)
                    );
                    if (Number(item.qty_received) <= 0) return;
                    receptionQuantities.set(
                      item.product_id,
                      (receptionQuantities.get(item.product_id) ?? 0) + quantity
                    );
                  });
                  const matchingProducts = Array.from(
                    receptionQuantities.entries()
                  ).filter(([productId, receivedQuantity]) =>
                    labelItems.some(
                      (item) =>
                        item.productId === productId &&
                        item.quantity >= receivedQuantity
                    )
                  ).length;
                  const loadedInSession = loadedReceivingLotIds.includes(lot.id);
                  const fullyLoaded =
                    loadedInSession &&
                    receptionQuantities.size > 0 &&
                    matchingProducts === receptionQuantities.size;
                  const partiallyLoaded =
                    loadedInSession && matchingProducts > 0 && !fullyLoaded;
                  const isActionLoading = receivingActionLotId === lot.id;
                  const itemCount = cachedDetail?.items.length;
                  const units = cachedDetail?.items.reduce(
                    (sum, item) => sum + Number(item.qty_received || 0),
                    0
                  );
                  return (
                    <article
                      key={lot.id}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {lot.lot_number}
                        </div>
                        <div className="shrink-0 text-[10px] text-slate-500">
                          {formatBogotaDate(lot.closed_at ?? lot.updated_at, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                        <div className="truncate text-[10px] text-slate-500">
                          {lot.origin_name || "Origen no definido"}
                          {itemCount != null && (
                            <> · {itemCount} ref. · {units?.toLocaleString("es-CO")} und.</>
                          )}
                        </div>
                        {(fullyLoaded || partiallyLoaded) && (
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              fullyLoaded
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {fullyLoaded ? "Cargada" : "Parcial"}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handlePreviewReceivingLot(lot)}
                          disabled={isActionLoading}
                          className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          title="Ver productos de la recepción"
                        >
                          {isActionLoading ? "Abriendo…" : "Ver"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleLoadReceivingLot(lot)}
                          disabled={isActionLoading}
                          className="rounded-md border border-emerald-500 bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                          title="Cargar productos en la lista de etiquetas"
                        >
                          {isActionLoading ? "Cargando…" : "Cargar"}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      </div>

      {previewLot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receiving-preview-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewLot(null);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Vista previa de recepción
                </p>
                <h2 id="receiving-preview-title" className="mt-1 text-xl font-bold text-slate-900">
                  {previewLot.lot_number}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {previewLot.origin_name} · {formatBogotaDate(
                    previewLot.closed_at ?? previewLot.updated_at,
                    { dateStyle: "medium", timeStyle: "short" }
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLot(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {receivingActionLotId === previewLot.id && !previewDetail ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Cargando productos de la recepción…
                </div>
              ) : receivingLotsError && !previewDetail ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                  {receivingLotsError}
                </div>
              ) : previewDetail?.items.length ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Abrió
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {previewDetail.lot.created_by_user_name || "No disponible"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {formatBogotaDate(previewDetail.lot.created_at, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Terminó
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {previewDetail.lot.closed_by_user_name || "No disponible"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {previewDetail.lot.closed_at
                          ? formatBogotaDate(previewDetail.lot.closed_at, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "Sin fecha de cierre"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Referencias
                      </div>
                      <div className="mt-1 text-lg font-bold text-slate-900">
                        {previewReferenceCount.toLocaleString("es-CO")}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Total productos
                      </div>
                      <div className="mt-1 text-lg font-bold text-emerald-800">
                        {previewUnitsTotal.toLocaleString("es-CO")}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Código de barras</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                        <th className="px-3 py-2 text-right">Cantidad recibida</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {previewDetail.items.map((item) => (
                        <tr key={item.id} className="text-slate-700">
                          <td className="px-3 py-2 font-mono text-xs">{item.sku_snapshot || "—"}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {item.product_name_snapshot}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {item.barcode_snapshot || "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatPriceForUi(Number(item.unit_price_snapshot) || 0)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {Number(item.qty_received).toLocaleString("es-CO")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  Esta recepción no tiene productos registrados.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-xs text-slate-500">
                Las cantidades podrán editarse después de cargar la recepción.
              </p>
              <button
                type="button"
                onClick={() => void handleLoadReceivingLot(previewLot, true)}
                disabled={!previewDetail?.items.length || receivingActionLotId === previewLot.id}
                className="rounded-lg border border-emerald-500 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cargar productos en etiquetas
              </button>
            </div>
          </div>
        </div>
      )}

      {exportWarningOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="high-quantity-warning-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExportWarningOpen(false);
          }}
        >
          <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg text-amber-800">
                  !
                </div>
                <div>
                  <h2 id="high-quantity-warning-title" className="text-lg font-bold text-slate-900">
                    Confirma las cantidades antes de exportar
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Estas líneas generarán 20 o más etiquetas cada una. Revisa que no sean productos que normalmente se reciben sin etiquetar.
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[90px_minmax(0,1fr)_90px] bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <span>SKU</span>
                  <span>Producto</span>
                  <span className="text-right">Etiquetas</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {highQuantityItems.map((item) => (
                    <div
                      key={item.productId}
                      className="grid grid-cols-[90px_minmax(0,1fr)_90px] items-center px-3 py-2 text-sm"
                    >
                      <span className="truncate font-mono text-xs text-slate-500">
                        {item.sku || "—"}
                      </span>
                      <span className="truncate font-medium text-slate-900" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-right text-base font-bold text-amber-700">
                        {item.quantity.toLocaleString("es-CO")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Si alguna cantidad no es correcta, vuelve a la lista para modificarla o quitar el producto.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setExportWarningOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Volver y revisar
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportWarningOpen(false);
                  void performExport();
                }}
                disabled={exportLoading}
                className="rounded-lg border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {exportLoading ? "Generando…" : "Sí, exportar estas cantidades"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
