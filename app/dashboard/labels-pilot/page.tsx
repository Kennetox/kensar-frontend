"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import type { Product as PosProduct } from "../../pos/poscontext";
import { getApiBase } from "@/lib/api/base";
import {
  LABEL_AGENT_DEFAULT_FORMAT,
  LABEL_AGENT_DEFAULT_PRINT_URL,
  LABEL_AGENT_HEALTH_URL,
  LABEL_AGENT_UI_URL,
  LABEL_AGENT_WINDOWS_DOWNLOAD_URL,
} from "@/lib/printing/labelAgentConfig";

type ProductSearchResult = Pick<
  PosProduct,
  "id" | "sku" | "name" | "price" | "barcode" | "label_format"
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

type LabelItem = {
  productId: number;
  sku: string;
  name: string;
  barcode: string | null;
  price: number;
  label_format: string | null;
  quantity: number;
};

const SESSION_STORAGE_STATE_KEY = "kensar_labels_pilot_session_state";
const TEST_LABEL: PrintPayload = {
  CODIGO: "3519",
  BARRAS: "3519",
  NOMBRE: "Microfono Condensador TCM-304",
  PRECIO: "$22.000",
  format: LABEL_AGENT_DEFAULT_FORMAT,
  copies: 1,
};

type LabelsPilotSessionState = {
  searchQuery: string;
  labelItems: LabelItem[];
  activeItemId: number | null;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const apiBase = getApiBase();

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentHealth, setAgentHealth] = useState<"checking" | "online" | "offline">(
    "checking"
  );

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
  const [sessionReady, setSessionReady] = useState(false);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>(
    {}
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const canUseApi = !!authHeaders;

  const checkAgentHealth = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(LABEL_AGENT_HEALTH_URL, {
        method: "GET",
        signal: controller.signal,
      });
      if (!res.ok) {
        setAgentHealth("offline");
        return;
      }
      setAgentHealth("online");
    } catch {
      setAgentHealth("offline");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const returnTo = searchParams.get("returnTo");
        if (returnTo) {
          router.push(returnTo);
          return;
        }
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, searchParams, settingsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_STATE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<LabelsPilotSessionState>;
        setSearchQuery(typeof parsed.searchQuery === "string" ? parsed.searchQuery : "");
        setLabelItems(Array.isArray(parsed.labelItems) ? parsed.labelItems : []);
        setActiveItemId(typeof parsed.activeItemId === "number" ? parsed.activeItemId : null);
      } catch (error) {
        console.warn("No se pudo restaurar la sesion de etiquetas piloto.", error);
      }
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionReady) return;
    const timeoutId = window.setTimeout(() => {
      const payload: LabelsPilotSessionState = {
        searchQuery,
        labelItems,
        activeItemId,
      };
      window.sessionStorage.setItem(
        SESSION_STORAGE_STATE_KEY,
        JSON.stringify(payload)
      );
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeItemId,
    labelItems,
    searchQuery,
    sessionReady,
  ]);

  useEffect(() => {
    if (searchParams.get("openSettings") === "1") {
      setSettingsOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!sessionReady) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sessionReady]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!settingsOpen) return;

    void checkAgentHealth();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void checkAgentHealth();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [checkAgentHealth, settingsOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    void checkAgentHealth();
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void checkAgentHealth();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkAgentHealth]);

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
              String(product.id ?? ""),
            ].map((value) => value.toLowerCase());
            return haystack.some((value) => value.includes(normalizedQuery));
          })
          .sort((a, b) => {
            const score = (product: PosProduct) => {
              const sku = (product.sku ?? "").toLowerCase();
              const barcode = (product.barcode ?? "").toLowerCase();
              const name = (product.name ?? "").toLowerCase();
              const id = String(product.id ?? "").toLowerCase();

              if (sku === normalizedQuery) return 0;
              if (barcode === normalizedQuery) return 1;
              if (sku.startsWith(normalizedQuery)) return 2;
              if (barcode.startsWith(normalizedQuery)) return 3;
              if (sku.includes(normalizedQuery)) return 4;
              if (barcode.includes(normalizedQuery)) return 5;
              if (name.includes(normalizedQuery)) return 6;
              if (id.includes(normalizedQuery)) return 7;
              return 8;
            };

            return score(a) - score(b);
          })
          .map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            barcode: product.barcode,
            price: product.price,
            label_format:
              typeof product.label_format === "string"
                ? product.label_format
                : null,
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
            label_format: product.label_format ?? null,
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
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const handleQuantityChange = useCallback(
    (productId: number, newQuantity: number) => {
      if (Number.isNaN(newQuantity)) return;
      const normalized = Math.max(1, Math.floor(newQuantity));
      setLabelItems((prev) =>
        prev.map((p) =>
          p.productId === productId ? { ...p, quantity: normalized } : p
        )
      );
    },
    []
  );

  const handleQuantityDraftChange = useCallback(
    (productId: number, rawValue: string) => {
      if (!/^\d*$/.test(rawValue)) return;
      setQuantityDrafts((prev) => ({ ...prev, [productId]: rawValue }));
      if (!rawValue) return;
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      handleQuantityChange(productId, parsed);
    },
    [handleQuantityChange]
  );

  const handleQuantityDraftCommit = useCallback(
    (productId: number) => {
      const draft = quantityDrafts[productId];
      const parsed = Number(draft);
      const shouldFallback =
        draft === undefined ||
        draft.trim() === "" ||
        !Number.isFinite(parsed) ||
        parsed <= 0;
      if (shouldFallback) {
        handleQuantityChange(productId, 1);
      } else {
        handleQuantityChange(productId, parsed);
      }
      setQuantityDrafts((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    },
    [handleQuantityChange, quantityDrafts]
  );

  const handleClearList = useCallback(() => {
    setLabelItems([]);
    setActiveItemId(null);
    setQuantityDrafts({});
  }, []);

  const formatPriceForPayload = (value: number) => {
    if (Number.isNaN(value)) return "$0";
    return `$${value.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const resolvedTargetUrl = LABEL_AGENT_DEFAULT_PRINT_URL;
  const validateTarget = useCallback(() => {}, []);

  const sendPrint = useCallback(
    async (payload: PrintPayload) => {
      await printLabelDirect(LABEL_AGENT_DEFAULT_PRINT_URL, payload);
    },
    []
  );

  const handleOpenAgentUi = useCallback(() => {
    window.open(LABEL_AGENT_UI_URL, "_blank", "noopener,noreferrer");
  }, []);

  const buildPayload = useCallback(
    (item: LabelItem): PrintPayload => {
      const codigo = item.sku || String(item.productId);
      const barras = item.barcode || codigo;
      return {
        CODIGO: codigo,
        BARRAS: barras,
        NOMBRE: item.name,
        PRECIO: formatPriceForPayload(item.price),
        format: item.label_format?.trim() || LABEL_AGENT_DEFAULT_FORMAT,
        copies: item.quantity > 0 ? item.quantity : 1,
      };
    },
    []
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
        format: LABEL_AGENT_DEFAULT_FORMAT,
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
  }, [sendPrint, validateTarget]);

  const closeSettings = useCallback(() => {
    const returnTo = searchParams.get("returnTo");
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    setSettingsOpen(false);
  }, [router, searchParams]);

  return (
    <main className="flex-1 px-6 py-6 dashboard-theme text-slate-900">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-[2rem] font-bold text-slate-900 leading-tight">
              Impresion directa SATO
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl">
              Piloto temporal para imprimir etiquetas con SATO FX3-LX usando un
              agente local en este equipo.
            </p>
          </div>
          {searchParams.get("returnTo") ? (
            <Link
              href={searchParams.get("returnTo") || "/dashboard/movements?tab=movements"}
              className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Volver
            </Link>
          ) : null}
        </header>

        <section className="rounded-3xl ui-surface p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span>
                <span className="font-semibold">Modo:</span> Agente local
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  agentHealth === "online"
                    ? "bg-emerald-100 text-emerald-700"
                    : agentHealth === "offline"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {agentHealth === "online"
                  ? "agente online"
                  : agentHealth === "offline"
                  ? "agente offline"
                  : "verificando agente"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              Configuracion
            </button>
          </div>
        </section>

        {settingsOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] p-4 md:p-8"
            onClick={closeSettings}
          >
            <div
              className="mx-auto mt-4 md:mt-10 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Configuración de impresión
                  </h3>
                  <p className="text-xs text-slate-600">
                    Ajusta el agente local y prueba conexion.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSettings}
                  className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="text-xs text-slate-600">
                    Abre la app del agente para autodeteccion y seleccion de impresora.
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={LABEL_AGENT_WINDOWS_DOWNLOAD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100"
                    >
                      Descargar agente (Windows)
                    </a>
                    <button
                      type="button"
                      onClick={handleOpenAgentUi}
                      className="px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                    >
                      Abrir app del agente
                    </button>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">
                      Conexion del agente
                    </h4>
                    <p className="text-xs text-slate-600">
                      Datos tecnicos para conectar con el print-agent local.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">
                        Modo
                      </label>
                      <input
                        className="ui-input w-full px-3 py-2 text-sm bg-white"
                        value="Agente local"
                        disabled
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-semibold text-slate-700">
                        URL del agente
                      </label>
                      <input
                        className="ui-input w-full px-3 py-2 text-sm bg-white"
                        value={resolvedTargetUrl}
                        placeholder={LABEL_AGENT_DEFAULT_PRINT_URL}
                        disabled
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 rounded-lg bg-white border border-slate-200 px-3 py-2">
                    Endpoint actual:{" "}
                    <span className="font-mono">
                      {resolvedTargetUrl || "sin definir"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm pt-1">
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
            </div>
          </div>
        )}

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
                    ref={searchInputRef}
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
              <div className="max-h-64 overflow-auto text-sm">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2 sticky top-0 z-10 bg-slate-100">SKU</th>
                      <th className="px-3 py-2 sticky top-0 z-10 bg-slate-100">Producto</th>
                      <th className="px-3 py-2 text-right sticky top-0 z-10 bg-slate-100">Precio</th>
                      <th className="px-3 py-2 w-24 text-center sticky top-0 z-10 bg-slate-100">Accion</th>
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
                              value={
                                quantityDrafts[item.productId] ??
                                String(item.quantity)
                              }
                              onChange={(e) =>
                                handleQuantityDraftChange(
                                  item.productId,
                                  e.target.value
                                )
                              }
                              onFocus={(e) => e.currentTarget.select()}
                              onClick={(e) => e.currentTarget.select()}
                              onBlur={() =>
                                handleQuantityDraftCommit(item.productId)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleQuantityDraftCommit(item.productId);
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
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
