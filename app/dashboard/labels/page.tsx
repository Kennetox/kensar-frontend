"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import type { Product as PosProduct } from "../../pos/poscontext";
import { getApiBase } from "@/lib/api/base";
import { exportLabelsExcel } from "@/lib/api/labels";

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

  const canUseApi = !!authHeaders;

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
            return haystack.some((value) =>
              value.includes(normalizedQuery)
            );
          })
          .slice(0, 200)
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

  const handleExport = useCallback(async () => {
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

  return (
    <main className="flex-1 px-6 py-6 dashboard-theme text-slate-900">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Encabezado principal */}
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
            Panel Metrik
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Etiquetas</h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Construye rápidamente una lista de productos para etiquetar y
            genera el archivo de Excel compatible.
          </p>
        </header>

        {/* Bloque 1: búsqueda de productos */}
        <section className="rounded-3xl ui-surface p-5 md:p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
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
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={searchLoading || !canUseApi}
                  className="px-4 py-2.5 rounded-md text-sm font-semibold border border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searchLoading ? "Buscando..." : "Buscar"}
                </button>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="px-4 py-2.5 rounded-md text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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
              <div className="max-h-80 overflow-auto text-sm">
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
        <section className="rounded-3xl ui-surface p-5 md:p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
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
              <div className="max-h-80 overflow-auto text-sm">
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
                                className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-slate-700"
                              />
                              <button
                                type="button"
                                onClick={() => handleIncrement(item.productId)}
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-300 text-slate-600 bg-white hover:bg-slate-50"
                              >
                                +
                              </button>
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
    </main>
  );
}
