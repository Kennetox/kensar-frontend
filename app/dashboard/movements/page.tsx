"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import {
  fetchInventoryOverview,
  fetchInventoryProducts,
  exportInventoryProducts,
  fetchInventoryProductHistory,
  type InventoryOverview,
  type InventoryMovementRecord,
  type InventoryProductPage,
  type InventoryProductHistory,
  type InventoryProductRow,
  type InventoryStatusRow,
} from "@/lib/api/inventory";

const movementReasonMeta: Record<
  string,
  { label: string; tone: string; badge: string }
> = {
  sale: {
    label: "Salida",
    tone: "text-amber-300",
    badge: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  },
  purchase: {
    label: "Entrada",
    tone: "text-emerald-300",
    badge: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  },
  adjustment: {
    label: "Ajuste",
    tone: "text-cyan-300",
    badge: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
  },
  count: {
    label: "Recuento",
    tone: "text-cyan-300",
    badge: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200",
  },
  loss: {
    label: "Perdida",
    tone: "text-rose-300",
    badge: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  },
  damage: {
    label: "Dano",
    tone: "text-rose-300",
    badge: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  },
  transfer_in: {
    label: "Entrada",
    tone: "text-emerald-300",
    badge: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  },
  transfer_out: {
    label: "Salida",
    tone: "text-amber-300",
    badge: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  },
};

const quickActions = [
  {
    title: "Entrada rapida",
    description: "Recibe stock mezclado y suma en segundos.",
    accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    button: "Registrar entrada",
  },
  {
    title: "Salida manual",
    description: "Descuenta productos por uso interno o consumo.",
    accent: "from-amber-500/20 via-amber-500/5 to-transparent",
    button: "Registrar salida",
  },
  {
    title: "Ajuste express",
    description: "Corrige diferencias sin pasar por conteo.",
    accent: "from-cyan-500/20 via-cyan-500/5 to-transparent",
    button: "Aplicar ajuste",
  },
  {
    title: "Perdidas y danos",
    description: "Registra rotos, vencidos o perdidas.",
    accent: "from-rose-500/20 via-rose-500/5 to-transparent",
    button: "Reportar perdida",
  },
];

type TabKey = "overview" | "catalog" | "entries" | "adjustments" | "count";

const tabs: Array<{ key: TabKey; label: string; helper: string }> = [
  { key: "overview", label: "Resumen", helper: "Vista general" },
  { key: "catalog", label: "Catalogo", helper: "Stock + valores" },
  { key: "entries", label: "Entradas", helper: "Recepcion rapida" },
  { key: "adjustments", label: "Ajustes", helper: "Salidas y perdidas" },
  { key: "count", label: "Recuento", helper: "Conteo fisico" },
];

export default function MovementsPage() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [productsPage, setProductsPage] = useState<InventoryProductPage | null>(
    null
  );
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogStockFilter, setCatalogStockFilter] = useState<
    "all" | "positive" | "zero" | "negative"
  >("all");
  const [catalogSort, setCatalogSort] = useState<
    "name_asc" | "stock_asc" | "stock_desc"
  >("name_asc");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<InventoryProductHistory | null>(
    null
  );
  const historyPageSize = 100;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
      }
    });
    fetchInventoryOverview(token)
      .then((data) => {
        if (!cancelled) {
          setOverview(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || activeTab !== "catalog") return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setProductsLoading(true);
        setProductsError(null);
      }
    });
    const skip = Math.max(0, (catalogPage - 1) * pageSize);
    const search = catalogSearch.trim();
    fetchInventoryProducts(token, {
      skip,
      limit: pageSize,
      search: search.length > 0 ? search : undefined,
      stock: catalogStockFilter,
      sort: catalogSort,
    })
      .then((data) => {
        if (!cancelled) {
          setProductsPage(data);
          setProductsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProductsError(err instanceof Error ? err.message : "Error al cargar");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProductsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    token,
    activeTab,
    catalogPage,
    pageSize,
    catalogSearch,
    catalogStockFilter,
    catalogSort,
  ]);

  const summaryCards = useMemo(() => {
    const summary = overview?.summary;
    return [
      {
        title: "Stock total",
        value: summary ? `${formatQty(summary.total_qty)} uds` : "0 uds",
        detail: summary ? "Inventario activo" : "Sin datos aun",
        tone: "text-emerald-300",
        ring: "ring-emerald-400/40",
      },
      {
        title: "Bajo stock",
        value: summary ? `${summary.low_stock_count} SKUs` : "0 SKUs",
        detail: summary
          ? `${summary.reorder_count} requieren reposicion`
          : "Sin alertas",
        tone: "text-amber-300",
        ring: "ring-amber-400/40",
      },
      {
        title: "Criticos",
        value: summary ? `${summary.critical_count} SKUs` : "0 SKUs",
        detail: summary ? "En cero o negativo" : "Sin criticos",
        tone: "text-rose-300",
        ring: "ring-rose-400/40",
      },
      {
        title: "Anomalias",
        value: summary ? `${summary.anomaly_count} casos` : "0 casos",
        detail: "Recuentos con diferencias",
        tone: "text-cyan-300",
        ring: "ring-cyan-400/40",
      },
    ];
  }, [overview]);

  const recentMovements = overview?.recent_movements ?? [];
  const statusRows = overview?.status_rows ?? [];
  const products = productsPage?.items ?? [];
  const totalProducts = productsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const canPrevCatalog = catalogPage > 1;
  const canNextCatalog = catalogPage < totalPages;

  const handleExport = async () => {
    if (!token) return;
    try {
      const blob = await exportInventoryProducts(token, {
        search: catalogSearch.trim() || undefined,
        stock: catalogStockFilter,
        sort: catalogSort,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventario.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exportando inventario", err);
    }
  };

  const handleOpenHistory = async (productId: number) => {
    if (!token) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await fetchInventoryProductHistory(token, productId, {
        skip: 0,
        limit: historyPageSize,
      });
      setHistoryData(data);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLoadMoreHistory = async () => {
    if (!token || !historyData || historyLoading) return;
    const nextSkip = historyData.movements.length;
    if (nextSkip >= historyData.total_movements) return;
    setHistoryLoading(true);
    try {
      const data = await fetchInventoryProductHistory(token, historyData.product_id, {
        skip: nextSkip,
        limit: historyPageSize,
      });
      setHistoryData({
        ...historyData,
        movements: [...historyData.movements, ...data.movements],
        skip: data.skip,
        limit: data.limit,
        total_movements: data.total_movements,
      });
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "catalog") return;
    if (catalogPage > totalPages) {
      setCatalogPage(totalPages);
    }
  }, [activeTab, catalogPage, totalPages]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    setCatalogPage(1);
  }, [activeTab, catalogSearch, catalogStockFilter, catalogSort, pageSize]);

  return (
    <div className="space-y-10">
      {activeTab === "overview" ? (
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 p-8 shadow-2xl">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute -left-24 top-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-cyan-500/20 blur-3xl" />
          </div>
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Inventario y movimientos
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                Control de stock en tiempo real
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                Centraliza entradas, salidas, ajustes y conteos con un flujo
                visual claro. Detecta faltantes, sobrantes y productos criticos
                sin perder trazabilidad.
              </p>
              {error ? (
                <p className="mt-4 text-sm text-rose-300">
                  {error}. Mostrando datos locales.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-500/20">
                Nueva entrada
              </button>
              <button className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                Recuento fisico
              </button>
              <button className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                Ver alertas
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-xl">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === "catalog") {
                setCatalogPage(1);
              }
            }}
            className={`group rounded-full border px-4 py-2 text-left text-xs font-semibold transition ${
              activeTab === tab.key
                ? "border-white/30 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10"
            }`}
          >
            <span className="block text-sm">{tab.label}</span>
            <span className="block text-[11px] font-normal text-slate-400 group-hover:text-slate-300">
              {tab.helper}
            </span>
          </button>
        ))}
      </section>

      {activeTab === "overview" ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.title}
                className={`rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-lg ring-1 ${card.ring}`}
              >
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  {card.title}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <h3 className={`text-2xl font-semibold ${card.tone}`}>
                    {card.value}
                  </h3>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    Hoy
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{card.detail}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Movimientos recientes
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Entradas, salidas y ajustes con trazabilidad completa.
                  </p>
                </div>
                <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                  Ver historial
                </button>
              </div>
              <div className="mt-6 space-y-4">
                {loading ? (
                  <p className="text-sm text-slate-400">
                    Cargando movimientos...
                  </p>
                ) : recentMovements.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aun no hay movimientos registrados.
                  </p>
                ) : (
                  recentMovements.map((movement) => (
                    <MovementRow key={movement.id} movement={movement} />
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Estado stock
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Indicadores visuales por criticidad.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  Ultimas 24h
                </span>
              </div>
              <div className="mt-6 space-y-3">
                {loading ? (
                  <p className="text-sm text-slate-400">Cargando estado...</p>
                ) : statusRows.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Aun no hay stock registrado.
                  </p>
                ) : (
                  statusRows.map((row) => (
                    <StatusRow key={row.product_id} row={row} />
                  ))
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1">
                  Positivo
                </span>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1">
                  Bajo stock
                </span>
                <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1">
                  Critico
                </span>
                <span className="rounded-full border border-slate-400/30 bg-slate-500/10 px-3 py-1">
                  Negativo / cero
                </span>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => (
              <div
                key={action.title}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-xl transition hover:-translate-y-1 hover:border-white/20"
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${action.accent}`}
                />
                <div className="relative">
                  <h3 className="text-lg font-semibold text-white">
                    {action.title}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {action.description}
                  </p>
                  <button className="mt-6 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition group-hover:border-white/30 group-hover:bg-white/10">
                    {action.button}
                  </button>
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}

      {activeTab === "catalog" ? (
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Catalogo de inventario
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Visualiza stock, costos y precios con indicadores claros.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                onClick={handleExport}
              >
                Exportar
              </button>
              <button className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-500/20">
                Nueva entrada
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300 lg:grid-cols-[1.6fr_1fr]">
            <div className="grid gap-3 md:grid-cols-[1.6fr_0.8fr_0.8fr]">
              <input
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white placeholder:text-slate-500"
                placeholder="Buscar por nombre, SKU o codigo de barras"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
              <select
                className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white"
                value={catalogSort}
                onChange={(event) =>
                  setCatalogSort(event.target.value as typeof catalogSort)
                }
              >
                <option value="name_asc">Orden alfabetico</option>
                <option value="stock_asc">Stock menor a mayor</option>
                <option value="stock_desc">Stock mayor a menor</option>
              </select>
              <select
                className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white"
                value={catalogStockFilter}
                onChange={(event) =>
                  setCatalogStockFilter(
                    event.target.value as typeof catalogStockFilter
                  )
                }
              >
                <option value="all">Todos los stocks</option>
                <option value="positive">Stock positivo</option>
                <option value="zero">Stock en cero</option>
                <option value="negative">Stock negativo</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span>
                  Mostrando {products.length} de {totalProducts}
                </span>
                {productsPage ? (
                  <span>{` | Pagina ${catalogPage} de ${totalPages}`}</span>
                ) : null}
                <div className="mt-2 text-xs text-slate-400">
                  Valor costo: {formatMoney(productsPage?.total_cost_value ?? 0)}{" "}
                  | Valor venta:{" "}
                  {formatMoney(productsPage?.total_price_value ?? 0)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Por pagina
                  <select
                    className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-white"
                    value={pageSize}
                    onChange={(event) => {
                      const nextSize = Number(event.target.value);
                      setPageSize(nextSize);
                      setCatalogPage(1);
                    }}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
                <button
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setCatalogPage((prev) => Math.max(1, prev - 1))}
                  disabled={!canPrevCatalog}
                >
                  Anterior
                </button>
                <button
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() =>
                    setCatalogPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={!canNextCatalog}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.6fr_0.7fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-3 bg-white/5 px-4 py-3 text-xs uppercase tracking-widest text-slate-500">
              <span>Producto</span>
              <span>SKU</span>
              <span>Stock</span>
              <span>Estado</span>
              <span>Costo</span>
              <span>Precio</span>
            </div>
            <div className="divide-y divide-white/5">
              {productsLoading ? (
                <div className="px-4 py-6 text-sm text-slate-400">
                  Cargando catalogo...
                </div>
              ) : productsError ? (
                <div className="px-4 py-6 text-sm text-rose-300">
                  {productsError}
                </div>
              ) : products.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-400">
                  No hay productos disponibles.
                </div>
              ) : (
                products.map((product) => (
                  <CatalogRow
                    key={product.product_id}
                    row={product}
                    onOpenHistory={handleOpenHistory}
                  />
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "entries" ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-white">Recepcion rapida</h2>
          <p className="mt-1 text-sm text-slate-400">
            Escanea o busca productos y registra cantidades en una sola tanda.
          </p>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                <input
                  className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  placeholder="Buscar por nombre o codigo"
                />
                <input
                  className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  placeholder="Cantidad"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  className="flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  placeholder="Notas o referencia"
                />
                <button className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/70 hover:bg-emerald-500/20">
                  Agregar a la lista
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                  Lista de recepcion
                </p>
                <span className="text-xs text-slate-400">3 productos</span>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Adaptador USB-C a HDMI</span>
                  <span className="text-emerald-200">+8</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cable HDMI 4K 3m Premium</span>
                  <span className="text-emerald-200">+12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Memoria SD 64GB</span>
                  <span className="text-emerald-200">+5</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Totales: 25 unidades
                </span>
                <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                  Confirmar entrada
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "adjustments" ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-white">Salida manual</h2>
            <p className="mt-1 text-sm text-slate-400">
              Descuenta stock por uso interno, consumo o ajustes puntuales.
            </p>
            <div className="mt-6 space-y-3">
              <input
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Producto"
              />
              <input
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Cantidad a descontar"
              />
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Motivo / notas"
              />
              <button className="rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-500/20">
                Registrar salida
              </button>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-white">Perdidas y danos</h2>
            <p className="mt-1 text-sm text-slate-400">
              Lleva control de rotos, vencidos o perdidas inesperadas.
            </p>
            <div className="mt-6 space-y-3">
              <input
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Producto"
              />
              <input
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Cantidad perdida"
              />
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Motivo / notas"
              />
              <button className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:border-rose-300/70 hover:bg-rose-500/20">
                Reportar perdida
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "count" ? (
        <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Recuento fisico
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Ajusta el stock al conteo real y registra diferencias.
              </p>
            </div>
            <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
              Iniciar sesion
            </button>
          </div>
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Producto"
              />
              <input
                className="rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                placeholder="Cantidad contada"
              />
              <button className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/20">
                Anadir al conteo
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="grid grid-cols-[1.6fr_0.6fr_0.6fr_0.6fr] gap-3 text-xs uppercase tracking-widest text-slate-500">
                <span>Producto</span>
                <span>Sistema</span>
                <span>Conteo</span>
                <span>Diferencia</span>
              </div>
              <div className="mt-3 space-y-3 text-sm">
                <div className="grid grid-cols-[1.6fr_0.6fr_0.6fr_0.6fr] items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                  <span className="text-slate-400">
                    Sin sesion de conteo activa.
                  </span>
                  <span className="text-slate-500">-</span>
                  <span className="text-slate-500">-</span>
                  <span className="text-slate-500">-</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>0 productos contados</span>
                <span>0 anomalias detectadas</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Se generara un ajuste automatico con las diferencias.
              </p>
              <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                Confirmar recuento
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur">
          <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Historial de producto
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {historyData?.product_name ?? "Producto"}
                </h3>
              </div>
              <button
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white transition hover:border-white/30 hover:bg-white/10"
                onClick={() => setHistoryOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="px-6 py-5">
              {historyLoading ? (
                <p className="text-sm text-slate-400">
                  Cargando historial...
                </p>
              ) : historyError ? (
                <p className="text-sm text-rose-300">{historyError}</p>
              ) : historyData ? (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Stock actual
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatQty(historyData.qty_on_hand)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Entradas
                      </p>
                      <p className="mt-2 text-lg font-semibold text-emerald-200">
                        {formatQty(historyData.total_in)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Salidas
                      </p>
                      <p className="mt-2 text-lg font-semibold text-rose-200">
                        {formatQty(historyData.total_out)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Neto
                      </p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {formatQty(historyData.net)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                    <div className="grid grid-cols-[0.8fr_0.6fr_1fr_1fr] gap-3 bg-white/5 px-4 py-3 text-xs uppercase tracking-widest text-slate-500">
                      <span>Tipo</span>
                      <span>Cantidad</span>
                      <span>Detalle</span>
                      <span>Fecha</span>
                    </div>
                    <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
                      {historyData.movements.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-400">
                          Sin movimientos registrados.
                        </div>
                      ) : (
                        historyData.movements.map((movement) => (
                          <div
                            key={movement.id}
                            className="grid grid-cols-[0.8fr_0.6fr_1fr_1fr] gap-3 px-4 py-3 text-sm text-slate-200"
                          >
                            <span>{resolveReasonLabel(movement.reason)}</span>
                            <span
                              className={
                                movement.qty_delta < 0
                                  ? "text-rose-300"
                                  : "text-emerald-300"
                              }
                            >
                              {movement.qty_delta > 0 ? "+" : ""}
                              {formatQty(movement.qty_delta)}
                            </span>
                            <span className="text-slate-400">
                              {movement.notes || movement.reference_type || "-"}
                            </span>
                            <span className="text-slate-400">
                              {formatTimestamp(movement.created_at)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-slate-400">
                      <span>
                        Mostrando {historyData.movements.length} de{" "}
                        {historyData.total_movements}
                      </span>
                      <button
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={handleLoadMoreHistory}
                        disabled={
                          historyLoading ||
                          historyData.movements.length >=
                            historyData.total_movements
                        }
                      >
                        Cargar mas
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Selecciona un producto para ver su historial.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatQty(value: number, maxDigits = 2) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function MovementRow({ movement }: { movement: InventoryMovementRecord }) {
  const meta = movementReasonMeta[movement.reason] ?? {
    label: "Movimiento",
    tone: "text-slate-200",
    badge: "border-white/10 bg-white/5 text-slate-200",
  };
  const qty = movement.qty_delta;
  const qtyLabel = `${qty > 0 ? "+" : ""}${formatQty(qty)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-xs font-semibold ${meta.tone}`}
        >
          {meta.label.slice(0, 2)}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">
            {movement.product_name}
          </p>
          <p className="text-xs text-slate-400">{meta.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <span className={`text-sm font-semibold ${meta.tone}`}>{qtyLabel}</span>
        <span className="text-xs text-slate-400">
          {formatTimestamp(movement.created_at)}
        </span>
      </div>
    </div>
  );
}

function StatusRow({ row }: { row: InventoryStatusRow }) {
  const meta =
    row.status === "critical"
      ? {
          label: "Critico",
          badge: "border-rose-500/40 bg-rose-500/10 text-rose-200",
        }
      : row.status === "low"
        ? {
            label: "Stock bajo",
            badge: "border-amber-500/40 bg-amber-500/10 text-amber-200",
          }
        : {
            label: "Stock saludable",
            badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
          };

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-white">{row.product_name}</p>
        <p className="text-xs text-slate-400">{meta.label}</p>
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs ${meta.badge}`}>
        {formatQty(row.qty_on_hand)} uds
      </span>
    </div>
  );
}

function CatalogRow({
  row,
  onOpenHistory,
}: {
  row: InventoryProductRow;
  onOpenHistory: (productId: number) => void;
}) {
  const meta =
    row.status === "critical"
      ? {
          label: "Critico",
          badge: "border-rose-500/40 bg-rose-500/10 text-rose-200",
        }
      : row.status === "low"
        ? {
            label: "Bajo",
            badge: "border-amber-500/40 bg-amber-500/10 text-amber-200",
          }
        : {
            label: "OK",
            badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
          };
  const costValue =
    row.qty_on_hand === 0
      ? 0
      : row.qty_on_hand < 0
        ? -Math.abs(row.cost)
        : row.cost;
  const priceValue =
    row.qty_on_hand === 0
      ? 0
      : row.qty_on_hand < 0
        ? -Math.abs(row.price)
        : row.price;

  return (
    <div
      className="grid cursor-pointer grid-cols-[1.6fr_0.7fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-3 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5"
      onDoubleClick={() => onOpenHistory(row.product_id)}
      title="Doble click para ver historial"
    >
      <span className="font-semibold text-white">{row.product_name}</span>
      <span className="text-slate-400">{row.sku || "-"}</span>
      <span>{formatQty(row.qty_on_hand)}</span>
      <span>
        <span className={`rounded-full border px-3 py-1 text-xs ${meta.badge}`}>
          {meta.label}
        </span>
      </span>
      <span className={costValue < 0 ? "text-rose-300" : ""}>
        {formatMoney(costValue)}
      </span>
      <span className={priceValue < 0 ? "text-rose-300" : ""}>
        {formatMoney(priceValue)}
      </span>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function resolveReasonLabel(reason: string) {
  return movementReasonMeta[reason]?.label ?? reason;
}
