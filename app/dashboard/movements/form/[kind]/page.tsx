"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../../providers/AuthProvider";
import {
  addReceivingLotItem,
  cancelManualMovementDocument,
  cancelReceivingLot,
  closeManualMovementDocument,
  closeReceivingLot,
  createManualMovementDocument,
  createManualSale,
  createPosCustomer,
  createReceivingLot,
  deleteReceivingLotItem,
  fetchManualMovementDocumentDetail,
  fetchInventoryProducts,
  fetchPosCustomers,
  fetchReceivingLots,
  fetchReceivingLotDetail,
  markReceivingLotItemLabelsPrinted,
  replaceManualMovementDocumentLines,
  updateManualMovementDocumentHeader,
  type ManualSaleCreatePayload,
  type ManualMovementDocumentDetail,
  type ManualMovementDocumentKind,
  type ManualMovementDocumentRead,
  type InventoryProductRow,
  type PosCustomerRead,
  type ReceivingLotDetail,
  type ReceivingLotRead,
  type ReceivingPurchaseType,
  updateReceivingLot,
  updateReceivingLotItem,
  uploadReceivingLotSupportFile,
} from "@/lib/api/inventory";
import {
  LABEL_AGENT_DEFAULT_FORMAT,
  LABEL_AGENT_DEFAULT_PRINT_URL,
  LABEL_AGENT_HEALTH_URL,
} from "@/lib/printing/labelAgentConfig";

const RECEIVING_DRAFT_LOT_KEY = "metrik_receiving_draft_lot_id_v1";
const RECEIVING_HEADER_SAVED_PREFIX = "metrik_receiving_header_saved_v1";
const MAX_OPEN_RECEIVING_LOTS = 2;
const GENERIC_DRAFT_DOC_KEY_PREFIX = "metrik_generic_movement_draft_doc_v1";
const GENERIC_DRAFT_STATE_KEY_PREFIX = "metrik_generic_movement_draft_state_v1";
const ACTIVE_MOVEMENT_FORM_KEY = "metrik_active_movement_form_v1";

type ActiveMovementFormSnapshot = {
  href: string;
  savedAt: number;
};

type LabelPrintPayload = {
  CODIGO: string;
  BARRAS: string;
  NOMBRE: string;
  PRECIO: string;
  format: string;
  copies: number;
};

async function printLabelDirect(
  targetUrl: string,
  payload: LabelPrintPayload
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

function persistActiveMovementForm(href: string) {
  if (typeof window === "undefined") return;
  const snapshot: ActiveMovementFormSnapshot = { href, savedAt: Date.now() };
  window.sessionStorage.setItem(ACTIVE_MOVEMENT_FORM_KEY, JSON.stringify(snapshot));
}

function clearActiveMovementForm() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACTIVE_MOVEMENT_FORM_KEY);
}

const formMeta = {
  entrada_manual: {
    title: "Formulario de entrada manual",
    subtitle: "Recepción por documento con líneas editables y cierre de lote.",
  },
  salida_manual: {
    title: "Formulario de salida manual",
    subtitle: "Registra salidas operativas o consumo interno.",
  },
  venta_manual: {
    title: "Formulario de venta manual",
    subtitle: "Flujo excepcional para registrar una venta con cliente.",
  },
  ajuste: {
    title: "Formulario de ajuste",
    subtitle: "Corrige diferencias incrementando o disminuyendo stock.",
  },
  perdida_dano: {
    title: "Formulario de pérdida / daño",
    subtitle: "Registra mermas por pérdida o daño con trazabilidad.",
  },
} as const;

type FormKind = keyof typeof formMeta;

function isFormKind(value: string): value is FormKind {
  return value in formMeta;
}

export default function MovementFormPage() {
  const params = useParams<{ kind: string }>();

  const kindParam = params?.kind;
  const kind = useMemo(() => {
    if (!kindParam || !isFormKind(kindParam)) return null;
    return kindParam;
  }, [kindParam]);

  if (!kind) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          Tipo de formulario inválido.
          <div className="mt-3">
            <Link
              href="/dashboard/movements?tab=movements"
              className="inline-flex rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700"
            >
              Volver a movimientos
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (kind === "entrada_manual") {
    return <EntryReceptionForm />;
  }

  if (kind === "salida_manual") {
    return <ManualExitForm />;
  }

  if (kind === "venta_manual") {
    return <ManualSaleForm />;
  }

  return <GenericMovementForm kind={kind} />;
}

function EntryReceptionForm() {
  const { token } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();

  const [lot, setLot] = useState<ReceivingLotRead | null>(null);
  const [detail, setDetail] = useState<ReceivingLotDetail | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [purchaseType, setPurchaseType] = useState<ReceivingPurchaseType | "">("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [notes, setNotes] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<InventoryProductRow[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProductRow | null>(null);

  const [lineQty, setLineQty] = useState("1");
  const [lineCost, setLineCost] = useState("");
  const [lineNotes, setLineNotes] = useState("");

  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingQty, setEditingQty] = useState("");
  const [editingCost, setEditingCost] = useState("");
  const [editingNotes, setEditingNotes] = useState("");

  const [agentHealth, setAgentHealth] = useState<"checking" | "online" | "offline">(
    "checking"
  );
  const [printingItemId, setPrintingItemId] = useState<number | null>(null);
  const [headerCompleted, setHeaderCompleted] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});

  const items = detail?.items ?? [];
  const lotIsOpen = lot?.status === "open";

  useEffect(() => {
    if (!lot || lot.status !== "open") return;
    persistActiveMovementForm(`/dashboard/movements/form/entrada_manual?lotId=${lot.id}`);
  }, [lot]);

  const goBackToMovements = useCallback(() => {
    clearActiveMovementForm();
    router.push("/dashboard/movements?tab=movements");
  }, [router]);

  const openSharedPrinterSettings = useCallback(() => {
    const params = new URLSearchParams();
    params.set("openSettings", "1");
    params.set("returnTo", `/dashboard/movements/form/entrada_manual${lot?.id ? `?lotId=${lot.id}` : ""}`);
    router.push(`/dashboard/labels-pilot?${params.toString()}`);
  }, [lot?.id, router]);

  const clearToastTimers = useCallback(() => {
    const timers = toastTimerRef.current;
    if (timers.hide) window.clearTimeout(timers.hide);
    if (timers.remove) window.clearTimeout(timers.remove);
  }, []);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    clearToastTimers();
    setToast({ message, tone });
    setToastVisible(false);
    window.requestAnimationFrame(() => setToastVisible(true));
    toastTimerRef.current.hide = window.setTimeout(() => setToastVisible(false), 2500);
    toastTimerRef.current.remove = window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 2850);
  }, [clearToastTimers]);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, [clearToastTimers]);

  useEffect(() => {
    if (!error) return;
    showToast(error, "error");
    setError(null);
  }, [error, showToast]);

  useEffect(() => {
    if (!feedback) return;
    showToast(feedback, "success");
    setFeedback(null);
  }, [feedback, showToast]);

  const checkAgentHealth = useCallback(async () => {
    if (typeof window === "undefined") return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(LABEL_AGENT_HEALTH_URL, {
        method: "GET",
        signal: controller.signal,
      });
      setAgentHealth(res.ok ? "online" : "offline");
    } catch {
      setAgentHealth("offline");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    void checkAgentHealth();
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void checkAgentHealth();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void checkAgentHealth();
    }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [checkAgentHealth]);

  const getHeaderSavedMark = useCallback((lotId: number) => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(`${RECEIVING_HEADER_SAVED_PREFIX}_${lotId}`) === "1";
  }, []);

  const hasHeaderProgress = useCallback((nextDetail: ReceivingLotDetail) => {
    const markedSaved = getHeaderSavedMark(nextDetail.lot.id);
    if (markedSaved) return true;
    return (
      nextDetail.items.length > 0 ||
      Boolean(
        (nextDetail.lot.supplier_name ?? "").trim() ||
          (nextDetail.lot.invoice_reference ?? "").trim() ||
          (nextDetail.lot.source_reference ?? "").trim() ||
          (nextDetail.lot.notes ?? "").trim() ||
          (nextDetail.lot.support_file_name ?? "").trim()
      )
    );
  }, [getHeaderSavedMark]);

  const applyLotToForm = useCallback((nextLot: ReceivingLotRead, preferBlankPurchaseType = false) => {
    setPurchaseType(preferBlankPurchaseType ? "" : nextLot.purchase_type);
    setSupplierName(nextLot.supplier_name ?? "");
    setInvoiceReference(nextLot.invoice_reference ?? nextLot.source_reference ?? "");
    setNotes(nextLot.notes ?? "");
  }, []);

  const loadDetail = useCallback(async (lotId: number) => {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const nextDetail = await fetchReceivingLotDetail(token, lotId);
      const headerDone = hasHeaderProgress(nextDetail);
      setDetail(nextDetail);
      setLot(nextDetail.lot);
      applyLotToForm(nextDetail.lot, !headerDone);
      setHeaderCompleted(headerDone);
      setHeaderCollapsed(headerDone);
    } finally {
      setLoadingDetail(false);
    }
  }, [applyLotToForm, hasHeaderProgress, token]);

  const hydrateFromOpenDetail = useCallback((existingDetail: ReceivingLotDetail) => {
    const headerDone = hasHeaderProgress(existingDetail);
    setDetail(existingDetail);
    setLot(existingDetail.lot);
    applyLotToForm(existingDetail.lot, !headerDone);
    window.localStorage.setItem(RECEIVING_DRAFT_LOT_KEY, String(existingDetail.lot.id));
    setHeaderCompleted(headerDone);
    setHeaderCollapsed(headerDone);
  }, [applyLotToForm, hasHeaderProgress]);

  const loadOpenLotsCount = useCallback(async () => {
    if (!token) return 0;
    const openLotsPage = await fetchReceivingLots(token, {
      status: "open",
      skip: 0,
      limit: 10,
    });
    return openLotsPage.items.length;
  }, [token]);

  const createNewLot = useCallback(async () => {
    if (!token) return false;
    const openCount = await loadOpenLotsCount();
    if (openCount >= MAX_OPEN_RECEIVING_LOTS) {
      setError(
        `Máximo ${MAX_OPEN_RECEIVING_LOTS} recepciones abiertas. Cierra o cancela una para crear otra.`
      );
      return false;
    }

    const created = await createReceivingLot(token, {
      purchase_type: "cash",
      origin_name: "Recepción web",
      source_reference: undefined,
      supplier_name: undefined,
      invoice_reference: undefined,
      notes: undefined,
    });
    window.localStorage.setItem(RECEIVING_DRAFT_LOT_KEY, String(created.id));
    window.localStorage.removeItem(`${RECEIVING_HEADER_SAVED_PREFIX}_${created.id}`);
    const createdDetail = await fetchReceivingLotDetail(token, created.id);
    setDetail(createdDetail);
    setLot(createdDetail.lot);
    applyLotToForm(createdDetail.lot, true);
    setHeaderCompleted(false);
    setHeaderCollapsed(false);
    await loadOpenLotsCount();
    return true;
  }, [applyLotToForm, loadOpenLotsCount, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const bootstrap = async () => {
      setBootLoading(true);
      setError(null);
      try {
        const lotIdParam = Number(searchParams.get("lotId"));
        const forceNew = searchParams.get("new") === "1";
        const forcedLotId =
          Number.isFinite(lotIdParam) && lotIdParam > 0 ? lotIdParam : null;

        if (forceNew && !forcedLotId) {
          window.localStorage.removeItem(RECEIVING_DRAFT_LOT_KEY);
          await createNewLot();
          return;
        }

        const storedRaw = window.localStorage.getItem(RECEIVING_DRAFT_LOT_KEY);
        const storedId = storedRaw ? Number(storedRaw) : NaN;
        const candidateLotId = forcedLotId ?? (Number.isFinite(storedId) && storedId > 0 ? storedId : null);

        if (candidateLotId) {
          try {
            const existingDetail = await fetchReceivingLotDetail(token, candidateLotId);
            if (!cancelled && existingDetail.lot.status === "open") {
              hydrateFromOpenDetail(existingDetail);
              await loadOpenLotsCount();
              return;
            }
          } catch {
            // Ignore stale draft id and create a new lot.
          }
        }

        if (!cancelled) {
          const openLotsPage = await fetchReceivingLots(token, {
            status: "open",
            skip: 0,
            limit: 10,
          });
          if (openLotsPage.items.length > 0) {
            const existingDetail = await fetchReceivingLotDetail(token, openLotsPage.items[0].id);
            if (!cancelled) {
              hydrateFromOpenDetail(existingDetail);
            }
            return;
          }
          await createNewLot();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error iniciando recepción");
        }
      } finally {
        if (!cancelled) {
          setBootLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token, createNewLot, hydrateFromOpenDetail, loadOpenLotsCount, searchParams]);

  useEffect(() => {
    if (!token) return;
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const handle = setTimeout(() => {
      fetchInventoryProducts(token, {
        skip: 0,
        limit: 25,
        search: searchQuery.trim(),
        sort: "name_asc",
      })
        .then((data) => {
          if (!cancelled) setSearchResults(data.items);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [token, searchQuery]);

  const saveReceptionHeader = async () => {
    if (!token || !lot) return false;

    if (!purchaseType) {
      setError("Debes seleccionar el tipo de compra.");
      return false;
    }

    const supplier = supplierName.trim();
    const invoice = invoiceReference.trim();

    if (purchaseType === "invoice" && (!supplier || !invoice)) {
      setError("Para compra con factura debes completar proveedor y referencia.");
      return false;
    }

    setWorking(true);
    setError(null);
    try {
      const updatedLot = await updateReceivingLot(token, lot.id, {
        purchase_type: purchaseType,
        supplier_name: supplier || undefined,
        invoice_reference: invoice || undefined,
        source_reference: invoice || undefined,
        notes: notes.trim() || undefined,
      });
      setLot(updatedLot);
      window.localStorage.setItem(`${RECEIVING_HEADER_SAVED_PREFIX}_${lot.id}`, "1");
      setHeaderCompleted(true);
      setHeaderCollapsed(true);
      setFeedback("Encabezado de recepción guardado.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el encabezado");
      return false;
    } finally {
      setWorking(false);
    }
  };

  const handleSupportSelect = async (file?: File) => {
    if (!token || !lot || !file) return;

    setWorking(true);
    setError(null);
    try {
      const updatedLot = await uploadReceivingLotSupportFile(token, lot.id, file);
      setLot(updatedLot);
      setFeedback("Soporte adjuntado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo adjuntar el soporte");
    } finally {
      setWorking(false);
    }
  };

  const handleAddLine = async () => {
    if (!token || !lot || !selectedProduct) return;
    if (!headerCompleted) {
      setError("Guarda primero los datos del encabezado para agregar productos.");
      return;
    }

    const qty = Number(lineQty);
    const cost = Number(lineCost || selectedProduct.cost);

    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (!Number.isInteger(qty)) {
      setError("La cantidad debe ser un número entero.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError("El costo unitario debe ser 0 o mayor.");
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await addReceivingLotItem(token, lot.id, {
        product_id: selectedProduct.product_id,
        qty_received: qty,
        unit_cost: cost,
        notes: lineNotes.trim() || undefined,
      });
      await loadDetail(lot.id);
      setFeedback("Producto agregado a la recepción.");
      setSelectedProduct(null);
      setLineQty("1");
      setLineCost("");
      setLineNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar el producto");
    } finally {
      setWorking(false);
    }
  };

  const startEditItem = (item: ReceivingLotDetail["items"][number]) => {
    setEditingItemId(item.id);
    setEditingQty(String(item.qty_received));
    setEditingCost(String(item.unit_cost_snapshot));
    setEditingNotes(item.notes ?? "");
  };

  const saveEditItem = async () => {
    if (!token || !lot || !editingItemId) return;

    const qty = Number(editingQty);
    const cost = Number(editingCost);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad editada debe ser mayor a 0.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError("El costo editado debe ser 0 o mayor.");
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await updateReceivingLotItem(token, lot.id, editingItemId, {
        qty_received: qty,
        unit_cost: cost,
        notes: editingNotes.trim() || undefined,
      });
      await loadDetail(lot.id);
      setEditingItemId(null);
      setFeedback("Línea actualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la línea");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!token || !lot) return;

    setWorking(true);
    setError(null);
    try {
      await deleteReceivingLotItem(token, lot.id, itemId);
      await loadDetail(lot.id);
      setFeedback("Línea eliminada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la línea");
    } finally {
      setWorking(false);
    }
  };

  const handleCloseReception = async () => {
    if (!token || !lot) return;

    if (!headerCompleted) {
      setError("Guarda primero los datos del encabezado.");
      return;
    }

    setWorking(true);
    setError(null);
    try {
      const closed = await closeReceivingLot(token, lot.id);
      setLot(closed);
      await loadDetail(lot.id);
      window.localStorage.removeItem(RECEIVING_DRAFT_LOT_KEY);
      window.localStorage.removeItem(`${RECEIVING_HEADER_SAVED_PREFIX}_${lot.id}`);
      clearActiveMovementForm();
      await loadOpenLotsCount();
      router.push("/dashboard/movements?tab=movements");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la recepción");
    } finally {
      setWorking(false);
    }
  };

  const handleCancelReception = async () => {
    if (!token || !lot) return;
    const confirmed = window.confirm(
      `¿Cancelar la recepción ${lot.lot_number}? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setWorking(true);
    setError(null);
    try {
      await cancelReceivingLot(token, lot.id);
      window.localStorage.removeItem(RECEIVING_DRAFT_LOT_KEY);
      window.localStorage.removeItem(`${RECEIVING_HEADER_SAVED_PREFIX}_${lot.id}`);
      clearActiveMovementForm();
      setFeedback(`Recepción ${lot.lot_number} cancelada.`);
      router.push("/dashboard/movements?tab=movements");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar la recepción");
    } finally {
      setWorking(false);
    }
  };

  const handlePrintLabel = useCallback(
    async (item: ReceivingLotDetail["items"][number]) => {
      if (!token || !lot) return;
      const sku = item.sku_snapshot?.trim();
      const barcode = item.barcode_snapshot?.trim();
      const codigo = sku && sku.length > 0 ? sku : String(item.product_id);
      const barras = barcode && barcode.length > 0 ? barcode : codigo;
      const copies = Math.max(1, Math.round(Number(item.qty_received) || 1));

      const payload: LabelPrintPayload = {
        CODIGO: codigo,
        BARRAS: barras,
        NOMBRE: item.product_name_snapshot,
        PRECIO: formatMoney(item.unit_price_snapshot ?? 0),
        format:
          item.label_format_snapshot?.trim() ||
          LABEL_AGENT_DEFAULT_FORMAT,
        copies,
      };

      try {
        setPrintingItemId(item.id);
        await printLabelDirect(LABEL_AGENT_DEFAULT_PRINT_URL, payload);
        await markReceivingLotItemLabelsPrinted(token, lot.id, item.id, copies);
        await loadDetail(lot.id);
        setFeedback(
          copies === 1
            ? "Etiqueta enviada a impresión."
            : `Etiquetas enviadas a impresión (${copies} copias).`
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo imprimir la etiqueta."
        );
      } finally {
        setPrintingItemId(null);
      }
    },
    [loadDetail, lot, token]
  );

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold leading-none text-slate-900">
            Formulario de entrada manual
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Recepción conectada a documento de lote con edición de líneas.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
            <span className="font-semibold">Agente:</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                agentHealth === "online"
                  ? "bg-emerald-100 text-emerald-700"
                  : agentHealth === "offline"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {agentHealth === "online"
                ? "online"
                : agentHealth === "offline"
                ? "offline"
                : "verificando"}
            </span>
          </div>
          <button
            type="button"
            onClick={openSharedPrinterSettings}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            Configuración impresora
          </button>
          <button
            type="button"
            onClick={goBackToMovements}
            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Volver a movimientos
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {bootLoading ? (
          <p className="text-sm text-slate-500">Creando recepción...</p>
        ) : lot ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-sm text-slate-700">
                <span className="font-semibold">Documento:</span> {lot.lot_number}
                <span className="mx-2 text-slate-400">|</span>
                <span className="font-semibold">Estado:</span> {lot.status === "open" ? "Abierto" : "Cerrado"}
              </div>
              {headerCompleted ? (
                <button
                  type="button"
                  onClick={() => setHeaderCollapsed((prev) => !prev)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  {headerCollapsed ? "Editar encabezado" : "Minimizar encabezado"}
                </button>
              ) : null}
            </div>

            {!headerCollapsed ? (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="text-sm text-slate-700 md:col-span-1">
                    Tipo compra
                    <select
                      value={purchaseType}
                      onChange={(e) =>
                        setPurchaseType(
                          e.target.value ? (e.target.value as ReceivingPurchaseType) : ""
                        )
                      }
                      disabled={!lotIsOpen}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona tipo</option>
                      <option value="invoice">Factura</option>
                      <option value="cash">Efectivo</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 md:col-span-1">
                    Proveedor {purchaseType === "invoice" ? "*" : ""}
                    <input
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      disabled={!lotIsOpen}
                      required={purchaseType === "invoice"}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm text-slate-700 md:col-span-1">
                    Referencia {purchaseType === "invoice" ? "*" : ""}
                    <input
                      value={invoiceReference}
                      onChange={(e) => setInvoiceReference(e.target.value)}
                      disabled={!lotIsOpen}
                      required={purchaseType === "invoice"}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="md:col-span-1 flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void saveReceptionHeader()}
                      disabled={!lotIsOpen || working}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                    >
                      Guardar datos
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="text-sm text-slate-700 md:col-span-3">
                    Notas de recepción
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      disabled={!lotIsOpen}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="md:col-span-1 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!lotIsOpen || working}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      Adjuntar soporte
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => void handleSupportSelect(e.target.files?.[0])}
                    />
                    <p className="text-[11px] text-slate-500 truncate" title={lot.support_file_name || ""}>
                      {lot.support_file_name || "Sin soporte adjunto"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Encabezado guardado · Tipo:{" "}
                <span className="font-semibold text-slate-800">
                  {purchaseType === "invoice" ? "Factura" : purchaseType === "cash" ? "Efectivo" : "-"}
                </span>{" "}
                · Proveedor: <span className="font-semibold text-slate-800">{supplierName || "-"}</span> · Ref:{" "}
                <span className="font-semibold text-slate-800">{invoiceReference || "-"}</span>
              </div>
            )}

            <div
              className={`rounded-xl border border-slate-200 bg-white ${
                headerCompleted ? "" : "pointer-events-none opacity-50"
              }`}
            >
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Buscar producto</p>
                <p className="text-xs text-slate-600">Por nombre, SKU o código de barras.</p>
              </div>
              <div className="space-y-3 p-4">
                {!headerCompleted ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Guarda primero los datos del documento para habilitar productos.
                  </p>
                ) : null}
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Escribe al menos 2 caracteres"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                {searchLoading ? <p className="text-xs text-slate-500">Buscando...</p> : null}
                <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3 py-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {searchResults.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-xs text-slate-500">
                            Sin resultados.
                          </td>
                        </tr>
                      ) : (
                        searchResults.map((row) => (
                          <tr key={row.product_id}>
                            <td className="px-3 py-2">{row.product_name}</td>
                            <td className="px-3 py-2 text-slate-600">{row.sku || "-"}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(row.cost)}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProduct(row);
                                  setLineQty("1");
                                  setLineCost(String(row.cost || 0));
                                  setLineNotes("");
                                }}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                              >
                                Seleccionar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {selectedProduct ? (
                  <div className="relative grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 md:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProduct(null);
                        setLineQty("1");
                        setLineCost("");
                        setLineNotes("");
                      }}
                      className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400 bg-white text-lg font-bold leading-none text-emerald-700 shadow-sm hover:bg-emerald-50"
                    >
                      ×
                    </button>
                    <div className="pr-12 text-xs text-emerald-800 md:col-span-4">
                      <p>
                        Producto seleccionado:{" "}
                        <span className="font-semibold">{selectedProduct.product_name}</span>
                      </p>
                    </div>
                    <label className="text-xs text-slate-700">
                      Cantidad
                      <input
                        value={lineQty}
                        onChange={(e) => setLineQty(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onClick={(e) => e.currentTarget.select()}
                        type="number"
                        min="1"
                        step="1"
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-700">
                      Costo unitario
                      <input
                        value={lineCost}
                        onChange={(e) => setLineCost(e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs text-slate-700 md:col-span-2">
                      Nota línea (opcional)
                      <input
                        value={lineNotes}
                        onChange={(e) => setLineNotes(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="md:col-span-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleAddLine()}
                        disabled={!lotIsOpen || working}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Agregar a recepción
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={`rounded-xl border border-slate-200 bg-white ${
                headerCompleted ? "" : "pointer-events-none opacity-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  Productos en recepción ({items.length})
                </p>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Costo</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2">Nota</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {loadingDetail ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-xs text-slate-500">
                          Cargando líneas...
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-xs text-slate-500">
                          Aún no hay productos agregados.
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const isEditing = editingItemId === item.id;
                        return (
                          <tr key={item.id}>
                            <td className="px-3 py-2">{item.product_name_snapshot}</td>
                            <td className="px-3 py-2 text-slate-700">{item.sku_snapshot || "-"}</td>
                            <td className="px-3 py-2 text-right">
                              {isEditing ? (
                                <input
                                  value={editingQty}
                                  onChange={(e) => setEditingQty(e.target.value)}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-xs"
                                />
                              ) : (
                                formatQty(item.qty_received)
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isEditing ? (
                                <input
                                  value={editingCost}
                                  onChange={(e) => setEditingCost(e.target.value)}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-xs"
                                />
                              ) : (
                                formatMoney(item.unit_cost_snapshot)
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {formatMoney(item.unit_price_snapshot)}
                            </td>
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <input
                                  value={editingNotes}
                                  onChange={(e) => setEditingNotes(e.target.value)}
                                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                              ) : (
                                item.notes || "-"
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handlePrintLabel(item)}
                                  disabled={printingItemId === item.id}
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                                >
                                  {printingItemId === item.id ? "Imprimiendo..." : "Imprimir etiqueta"}
                                </button>
                                {lotIsOpen ? (
                                  isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => void saveEditItem()}
                                        className="rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                                      >
                                        Guardar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingItemId(null)}
                                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => startEditItem(item)}
                                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteItem(item.id)}
                                        className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                                      >
                                        Eliminar
                                      </button>
                                    </>
                                  )
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleCancelReception()}
                disabled={!lotIsOpen || working}
                className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
              >
                Cancelar recepción
              </button>
              <button
                type="button"
                onClick={() => void handleCloseReception()}
                disabled={!lotIsOpen || working || items.length === 0}
                className="rounded-md border border-emerald-500 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Cerrar recepción
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-rose-600">No fue posible iniciar una recepción.</p>
        )}
      </section>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "fixed", top: 20, right: 20, left: "auto", bottom: "auto" }}
          className={`z-[999] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
            toast.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          } ${toastVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

type ExitDraftLine = {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string | null;
  qty: number;
  notes?: string;
};

function ManualExitForm() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdParam = searchParams.get("docId");
  const parsedDocId = docIdParam ? Number(docIdParam) : NaN;

  const [headerSaved, setHeaderSaved] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [exitType, setExitType] = useState<"" | "operativa" | "consumo_interno" | "transferencia">("");
  const [destination, setDestination] = useState("");
  const [reference, setReference] = useState("");
  const [headerNotes, setHeaderNotes] = useState("");

  const [productQuery, setProductQuery] = useState("");
  const [lookup, setLookup] = useState<InventoryProductRow[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProductRow | null>(null);
  const [lineQty, setLineQty] = useState("1");
  const [lineNotes, setLineNotes] = useState("");
  const [lines, setLines] = useState<ExitDraftLine[]>([]);
  const [document, setDocument] = useState<ManualMovementDocumentRead | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});

  useEffect(() => {
    if (!document || document.status !== "open") return;
    persistActiveMovementForm(`/dashboard/movements/form/salida_manual?docId=${document.id}`);
  }, [document]);

  const goBackToMovements = useCallback(() => {
    clearActiveMovementForm();
    router.push("/dashboard/movements?tab=movements");
  }, [router]);

  const clearToastTimers = useCallback(() => {
    const timers = toastTimerRef.current;
    if (timers.hide) window.clearTimeout(timers.hide);
    if (timers.remove) window.clearTimeout(timers.remove);
  }, []);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    clearToastTimers();
    setToast({ message, tone });
    setToastVisible(false);
    window.requestAnimationFrame(() => setToastVisible(true));
    toastTimerRef.current.hide = window.setTimeout(() => setToastVisible(false), 2500);
    toastTimerRef.current.remove = window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 2850);
  }, [clearToastTimers]);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, [clearToastTimers]);

  const persistLines = useCallback(
    async (nextLines: ExitDraftLine[]) => {
      if (!token || !document) return;
      await replaceManualMovementDocumentLines(token, document.id, {
        lines: nextLines.map((line) => ({
          product_id: line.product_id,
          qty: line.qty,
          notes: line.notes,
        })),
      });
    },
    [token, document]
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBootLoading(true);

    const load = async () => {
      try {
        const detail: ManualMovementDocumentDetail =
          Number.isFinite(parsedDocId) && parsedDocId > 0
            ? await fetchManualMovementDocumentDetail(token, parsedDocId)
            : await (async () => {
                const created = await createManualMovementDocument(token, {
                  kind: "salida_manual",
                  origin_name: "Metrik web",
                  header: {},
                });
                router.replace(`/dashboard/movements/form/salida_manual?docId=${created.id}`);
                return await fetchManualMovementDocumentDetail(token, created.id);
              })();
        if (cancelled) return;
        const header = detail.document.header || {};
        setDocument(detail.document);
        setHeaderSaved(Boolean(header.header_saved));
        setHeaderCollapsed(Boolean(header.header_saved));
        setExitType(((header.exit_type as string) || "") as "" | "operativa" | "consumo_interno" | "transferencia");
        setDestination((header.destination as string) || "");
        setReference((header.reference as string) || "");
        setHeaderNotes((header.header_notes as string) || detail.document.notes || "");
        setLines(
          detail.lines.map((line) => ({
            id: line.id,
            product_id: line.product_id,
            product_name: line.product_name_snapshot,
            sku: line.sku_snapshot,
            qty: Math.max(1, Math.round(line.qty)),
            notes: line.notes || undefined,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : "No se pudo cargar el documento.", "error");
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, parsedDocId, router, showToast]);

  useEffect(() => {
    if (!token) return;
    const query = productQuery.trim();
    const looksLikeCode = /^[0-9]+$/.test(query);
    if (query.length < 2 && !looksLikeCode) {
      setLookup([]);
      return;
    }

    let cancelled = false;
    setLookupLoading(true);
    const handle = setTimeout(() => {
      fetchInventoryProducts(token, {
        skip: 0,
        limit: 20,
        search: productQuery.trim(),
        sort: "name_asc",
      })
        .then((data) => {
          if (!cancelled) setLookup(data.items);
        })
        .catch(() => {
          if (!cancelled) setLookup([]);
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [productQuery, token]);

  const saveHeader = async () => {
    if (!token || !document) return;
    if (!exitType) {
      showToast("Selecciona el tipo de salida.", "error");
      return;
    }
    if (!destination.trim()) {
      showToast("El destino es obligatorio.", "error");
      return;
    }
    try {
      const updated = await updateManualMovementDocumentHeader(token, document.id, {
        header: {
          header_saved: true,
          exit_type: exitType,
          destination: destination.trim(),
          reference: reference.trim(),
          header_notes: headerNotes.trim(),
        },
        notes: headerNotes.trim() || undefined,
      });
      setDocument(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo guardar encabezado.", "error");
      return;
    }
    setHeaderSaved(true);
    setHeaderCollapsed(true);
    showToast("Encabezado de salida guardado.", "success");
  };

  const addLine = () => {
    if (!headerSaved) {
      showToast("Guarda primero el encabezado.", "error");
      return;
    }
    if (!selectedProduct) {
      showToast("Selecciona un producto.", "error");
      return;
    }
    const qty = Number(lineQty);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      showToast("La cantidad debe ser un entero mayor a 0.", "error");
      return;
    }

    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === selectedProduct.product_id);
      const next = !existing
        ? [
          ...prev,
          {
            id: Date.now(),
            product_id: selectedProduct.product_id,
            product_name: selectedProduct.product_name,
            sku: selectedProduct.sku,
            qty,
            notes: lineNotes.trim() || undefined,
          },
        ]
        : prev.map((line) =>
            line.product_id === selectedProduct.product_id
              ? {
                  ...line,
                  qty: line.qty + qty,
                  notes: lineNotes.trim() || line.notes,
                }
              : line
          );
      void persistLines(next);
      return next;
    });

    setSelectedProduct(null);
    setLineQty("1");
    setLineNotes("");
    setProductQuery("");
    setLookup([]);
    showToast("Producto agregado a la salida.", "success");
  };

  const removeLine = (lineId: number) => {
    setLines((prev) => {
      const next = prev.filter((line) => line.id !== lineId);
      void persistLines(next);
      return next;
    });
  };

  const closeExit = async () => {
    if (!token) return;
    if (!document) {
      showToast("No se encontró el documento de salida.", "error");
      return;
    }
    if (!headerSaved) {
      showToast("Guarda primero el encabezado.", "error");
      return;
    }
    if (lines.length === 0) {
      showToast("Agrega al menos un producto para cerrar la salida.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await updateManualMovementDocumentHeader(token, document.id, {
        header: {
          header_saved: true,
          exit_type: exitType,
          destination: destination.trim(),
          reference: reference.trim(),
          header_notes: headerNotes.trim(),
        },
        notes: headerNotes.trim() || undefined,
      });
      await replaceManualMovementDocumentLines(token, document.id, {
        lines: lines.map((line) => ({
          product_id: line.product_id,
          qty: line.qty,
          notes: line.notes,
        })),
      });
      await closeManualMovementDocument(token, document.id);
      clearActiveMovementForm();
      router.push("/dashboard/movements?tab=movements");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo cerrar la salida", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold leading-none text-slate-900">
            Formulario de salida manual
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Registra salidas operativas con control por líneas antes de cerrar.
          </p>
        </div>
        <button
          type="button"
          onClick={goBackToMovements}
          className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Volver a movimientos
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {bootLoading ? <p className="px-1 text-sm text-slate-500">Cargando documento...</p> : null}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Documento:</span> {document?.document_number || "Generando..."}
              <span className="mx-2 text-slate-300">|</span>
              <span className="font-semibold">Estado:</span> {headerSaved ? "Encabezado guardado" : "Pendiente"}
            </div>
            {headerSaved ? (
              <button
                type="button"
                onClick={() => setHeaderCollapsed((prev) => !prev)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                {headerCollapsed ? "Editar encabezado" : "Minimizar encabezado"}
              </button>
            ) : null}
          </div>

          {!headerCollapsed ? (
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-sm text-slate-700">
                Tipo salida *
                <select
                  value={exitType}
                  onChange={(e) => setExitType(e.target.value as "" | "operativa" | "consumo_interno" | "transferencia")}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecciona tipo</option>
                  <option value="operativa">Operativa</option>
                  <option value="consumo_interno">Consumo interno</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Destino *
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-slate-700">
                Referencia
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={saveHeader}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Guardar datos
                </button>
              </div>
              <label className="text-sm text-slate-700 md:col-span-4">
                Observaciones
                <textarea
                  value={headerNotes}
                  onChange={(e) => setHeaderNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Salida guardada · Tipo: <span className="font-semibold text-slate-800">{exitType || "-"}</span> · Destino:{" "}
              <span className="font-semibold text-slate-800">{destination || "-"}</span> · Ref:{" "}
              <span className="font-semibold text-slate-800">{reference || "-"}</span>
            </div>
          )}

          <div className={`rounded-xl border border-slate-200 bg-white ${headerSaved ? "" : "pointer-events-none opacity-50"}`}>
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Buscar producto</p>
              <p className="text-xs text-slate-600">Por nombre, SKU o código de barras.</p>
            </div>
            <div className="space-y-3 p-4">
              {!headerSaved ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Guarda primero el encabezado para habilitar productos.
                </p>
              ) : null}
              <input
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setSelectedProduct(null);
                }}
                placeholder="Escribe al menos 2 caracteres"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {lookupLoading ? <p className="text-xs text-slate-500">Buscando...</p> : null}
              <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {lookup.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-xs text-slate-500">Sin resultados.</td>
                      </tr>
                    ) : (
                      lookup.map((row) => (
                        <tr key={row.product_id}>
                          <td className="px-3 py-2">{row.product_name}</td>
                          <td className="px-3 py-2 text-slate-600">{row.sku || "-"}</td>
                          <td className="px-3 py-2 text-right">{formatQty(row.qty_on_hand)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProduct(row);
                                setLineQty("1");
                                setLineNotes("");
                              }}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              Seleccionar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {selectedProduct ? (
                <div className="grid gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 md:grid-cols-4">
                  <p className="text-xs text-rose-800 md:col-span-4">
                    Producto seleccionado: <span className="font-semibold">{selectedProduct.product_name}</span>
                  </p>
                  <label className="text-xs text-slate-700">
                    Cantidad
                    <input
                      value={lineQty}
                      onChange={(e) => setLineQty(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      type="number"
                      min="1"
                      step="1"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-700 md:col-span-2">
                    Nota línea (opcional)
                    <input
                      value={lineNotes}
                      onChange={(e) => setLineNotes(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="flex items-end justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={addLine}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`rounded-xl border border-slate-200 bg-white ${headerSaved ? "" : "pointer-events-none opacity-50"}`}>
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Productos en salida ({lines.length})</p>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-xs text-slate-500">Aún no hay productos agregados.</td>
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 text-slate-900">{line.product_name}</td>
                        <td className="px-3 py-2 text-slate-700">{line.sku || "-"}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatQty(line.qty, 0)}</td>
                        <td className="px-3 py-2 text-slate-700">{line.notes || "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                if (token && document?.id) {
                  await cancelManualMovementDocument(token, document.id).catch(() => null);
                }
                clearActiveMovementForm();
                router.push("/dashboard/movements?tab=movements");
              }}
              className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
            >
              Cancelar salida
            </button>
            <button
              type="button"
              onClick={() => void closeExit()}
              disabled={submitting || lines.length === 0}
              className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Registrando..." : "Cerrar salida"}
            </button>
          </div>
        </div>
      </section>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "fixed", top: 20, right: 20, left: "auto", bottom: "auto" }}
          className={`z-[999] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
            toast.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          } ${toastVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

type ManualSaleLine = {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string | null;
  barcode?: string | null;
  qty: number;
  unit_price: number;
  line_discount_value: number;
};

function ManualSaleForm() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdParam = searchParams.get("docId");
  const parsedDocId = docIdParam ? Number(docIdParam) : NaN;
  const [document, setDocument] = useState<ManualMovementDocumentRead | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerLookup, setCustomerLookup] = useState<PosCustomerRead[]>([]);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerRead | null>(null);

  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [quickCustomerEmail, setQuickCustomerEmail] = useState("");

  const [discountValue, setDiscountValue] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saleNotes, setSaleNotes] = useState("");
  const [headerSaved, setHeaderSaved] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const [productQuery, setProductQuery] = useState("");
  const [lookup, setLookup] = useState<InventoryProductRow[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProductRow | null>(null);
  const [lineQty, setLineQty] = useState("1");
  const [lineDiscountValue, setLineDiscountValue] = useState("0");
  const [lines, setLines] = useState<ManualSaleLine[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<{ hide?: number; remove?: number }>({});

  useEffect(() => {
    if (!document || document.status !== "open") return;
    persistActiveMovementForm(`/dashboard/movements/form/venta_manual?docId=${document.id}`);
  }, [document]);

  const goBackToMovements = useCallback(() => {
    clearActiveMovementForm();
    router.push("/dashboard/movements?tab=movements");
  }, [router]);

  const clearToastTimers = useCallback(() => {
    const timers = toastTimerRef.current;
    if (timers.hide) window.clearTimeout(timers.hide);
    if (timers.remove) window.clearTimeout(timers.remove);
  }, []);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    clearToastTimers();
    setToast({ message, tone });
    setToastVisible(false);
    window.requestAnimationFrame(() => setToastVisible(true));
    toastTimerRef.current.hide = window.setTimeout(() => setToastVisible(false), 2500);
    toastTimerRef.current.remove = window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 2850);
  }, [clearToastTimers]);

  useEffect(() => {
    return () => {
      clearToastTimers();
    };
  }, [clearToastTimers]);

  const persistLines = useCallback(
    async (nextLines: ManualSaleLine[]) => {
      if (!token || !document) return;
      await replaceManualMovementDocumentLines(token, document.id, {
        lines: nextLines.map((line) => ({
          product_id: line.product_id,
          qty: line.qty,
          unit_price: line.unit_price,
          notes: JSON.stringify({
            line_discount_value: line.line_discount_value,
          }),
        })),
      });
    },
    [token, document]
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBootLoading(true);

    const load = async () => {
      try {
        const detail: ManualMovementDocumentDetail =
          Number.isFinite(parsedDocId) && parsedDocId > 0
            ? await fetchManualMovementDocumentDetail(token, parsedDocId)
            : await (async () => {
                const created = await createManualMovementDocument(token, {
                  kind: "venta_manual",
                  origin_name: "Metrik web",
                  header: {},
                });
                router.replace(`/dashboard/movements/form/venta_manual?docId=${created.id}`);
                return await fetchManualMovementDocumentDetail(token, created.id);
              })();
        if (cancelled) return;
        const header = detail.document.header || {};
        setDocument(detail.document);
        setHeaderSaved(Boolean(header.header_saved));
        setHeaderCollapsed(Boolean(header.header_saved));
        setDiscountValue(String((header.discount_value as number) ?? 0));
        setPaymentMethod(String((header.payment_method as string) || "cash"));
        setSaleNotes(((header.sale_notes as string) || detail.document.notes || ""));
        const customerName = String(header.customer_name || "").trim();
        const customerIdRaw = Number(header.customer_id ?? 0);
        if (customerName) {
          setSelectedCustomer({
            id: Number.isFinite(customerIdRaw) && customerIdRaw > 0 ? customerIdRaw : -1,
            name: customerName,
            phone: (header.customer_phone as string) || null,
            email: (header.customer_email as string) || null,
            tax_id: (header.customer_tax_id as string) || null,
            address: (header.customer_address as string) || null,
            is_active: true,
            created_at: "",
            updated_at: "",
          });
        }
        setLines(
          detail.lines.map((line) => ({
            id: line.id,
            product_id: line.product_id,
            product_name: line.product_name_snapshot,
            sku: line.sku_snapshot,
            barcode: line.barcode_snapshot,
            qty: Math.max(1, Math.round(line.qty)),
            unit_price: Number(line.unit_price_snapshot || 0),
            line_discount_value: (() => {
              if (!line.notes) return 0;
              try {
                const parsed = JSON.parse(line.notes) as { line_discount_value?: number };
                const value = Number(parsed?.line_discount_value ?? 0);
                return Number.isFinite(value) && value > 0 ? value : 0;
              } catch {
                return 0;
              }
            })(),
          }))
        );
      } catch (err) {
        if (!cancelled) showToast(err instanceof Error ? err.message : "No se pudo cargar el documento.", "error");
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, parsedDocId, router, showToast]);

  useEffect(() => {
    if (!token) return;
    if (customerQuery.trim().length < 2) {
      setCustomerLookup([]);
      return;
    }

    let cancelled = false;
    setCustomerLookupLoading(true);
    const handle = setTimeout(() => {
      fetchPosCustomers(token, { search: customerQuery.trim(), limit: 20 })
        .then((rows) => {
          if (!cancelled) setCustomerLookup(rows);
        })
        .catch(() => {
          if (!cancelled) setCustomerLookup([]);
        })
        .finally(() => {
          if (!cancelled) setCustomerLookupLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [customerQuery, token]);

  useEffect(() => {
    if (!token) return;
    const query = productQuery.trim();
    const looksLikeCode = /^[0-9]+$/.test(query);
    if (query.length < 2 && !looksLikeCode) {
      setLookup([]);
      return;
    }

    let cancelled = false;
    setLookupLoading(true);
    const handle = setTimeout(() => {
      fetchInventoryProducts(token, {
        skip: 0,
        limit: 20,
        search: productQuery.trim(),
        sort: "name_asc",
      })
        .then((data) => {
          if (!cancelled) setLookup(data.items);
        })
        .catch(() => {
          if (!cancelled) setLookup([]);
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [productQuery, token]);

  const saveHeader = async () => {
    if (!token || !document) return;
    if (!selectedCustomer) {
      showToast("Debes seleccionar un cliente para continuar.", "error");
      return;
    }
    const discount = Number(discountValue);
    if (!Number.isFinite(discount) || discount < 0) {
      showToast("El descuento debe ser 0 o mayor.", "error");
      return;
    }
    if (!paymentMethod.trim()) {
      showToast("Selecciona un método de pago.", "error");
      return;
    }
    try {
      const updated = await updateManualMovementDocumentHeader(token, document.id, {
        header: {
          header_saved: true,
          customer_id: selectedCustomer.id > 0 ? selectedCustomer.id : null,
          customer_name: selectedCustomer.name,
          customer_phone: selectedCustomer.phone || null,
          customer_email: selectedCustomer.email || null,
          customer_tax_id: selectedCustomer.tax_id || null,
          customer_address: selectedCustomer.address || null,
          payment_method: paymentMethod,
          discount_value: discount,
          sale_notes: saleNotes.trim(),
        },
        notes: saleNotes.trim() || undefined,
      });
      setDocument(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo guardar encabezado.", "error");
      return;
    }
    setHeaderSaved(true);
    setHeaderCollapsed(true);
    showToast("Encabezado de venta guardado.", "success");
  };

  const handleQuickCreateCustomer = async () => {
    if (!token) return;
    if (!quickCustomerName.trim()) {
      showToast("Nombre del cliente es obligatorio.", "error");
      return;
    }
    try {
      const created = await createPosCustomer(token, {
        name: quickCustomerName.trim(),
        phone: quickCustomerPhone.trim() || undefined,
        email: quickCustomerEmail.trim() || undefined,
      });
      setSelectedCustomer(created);
      setCustomerQuery(created.name);
      setCustomerLookup([]);
      setQuickCustomerName("");
      setQuickCustomerPhone("");
      setQuickCustomerEmail("");
      setCustomerModalOpen(false);
      showToast("Cliente creado y seleccionado.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo crear el cliente", "error");
    }
  };

  const addLine = () => {
    if (!headerSaved) {
      showToast("Guarda primero el encabezado.", "error");
      return;
    }
    if (!selectedProduct) {
      showToast("Selecciona un producto.", "error");
      return;
    }
    const qty = Number(lineQty);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      showToast("La cantidad debe ser un entero mayor a 0.", "error");
      return;
    }
    const lineDiscount = Number(lineDiscountValue);
    if (!Number.isFinite(lineDiscount) || lineDiscount < 0) {
      showToast("El descuento por línea debe ser 0 o mayor.", "error");
      return;
    }
    const lineSubtotal = qty * Number(selectedProduct.price || 0);
    if (lineDiscount > lineSubtotal) {
      showToast("El descuento por línea no puede superar el subtotal del producto.", "error");
      return;
    }

    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === selectedProduct.product_id);
      const next = !existing
        ? [
          ...prev,
          {
            id: Date.now(),
            product_id: selectedProduct.product_id,
            product_name: selectedProduct.product_name,
            sku: selectedProduct.sku,
            barcode: selectedProduct.barcode,
            qty,
            unit_price: Number(selectedProduct.price || 0),
            line_discount_value: lineDiscount,
          },
        ]
        : prev.map((line) =>
            line.product_id === selectedProduct.product_id
              ? { ...line, qty: line.qty + qty, line_discount_value: line.line_discount_value + lineDiscount }
              : line
          );
      void persistLines(next);
      return next;
    });

    setSelectedProduct(null);
    setProductQuery("");
    setLookup([]);
    setLineQty("1");
    setLineDiscountValue("0");
    showToast("Producto agregado a la venta.", "success");
  };

  const updateLineDiscount = (lineId: number, rawValue: string) => {
    const parsed = Number(rawValue);
    const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const maxAllowed = line.qty * line.unit_price;
        return { ...line, line_discount_value: Math.min(nextValue, maxAllowed) };
      })
    );
  };

  const persistCurrentLines = () => {
    setLines((prev) => {
      void persistLines(prev);
      return prev;
    });
  };

  const removeLine = (lineId: number) => {
    setLines((prev) => {
      const next = prev.filter((line) => line.id !== lineId);
      void persistLines(next);
      return next;
    });
  };

  const grossSubtotal = useMemo(
    () => lines.reduce((acc, line) => acc + line.qty * line.unit_price, 0),
    [lines]
  );
  const lineDiscountTotal = useMemo(
    () => lines.reduce((acc, line) => acc + line.line_discount_value, 0),
    [lines]
  );
  const subtotal = useMemo(
    () => Math.max(0, grossSubtotal - lineDiscountTotal),
    [grossSubtotal, lineDiscountTotal]
  );
  const discount = Number(discountValue);
  const discountSafe = Number.isFinite(discount) && discount >= 0 ? discount : 0;
  const total = Math.max(0, subtotal - discountSafe);

  const closeSale = async () => {
    if (!token || !document) return;
    if (!headerSaved) {
      showToast("Guarda primero el encabezado.", "error");
      return;
    }
    if (lines.length === 0) {
      showToast("Agrega al menos un producto para cerrar la venta.", "error");
      return;
    }
    if (lineDiscountTotal > grossSubtotal) {
      showToast("El descuento por líneas no puede superar el subtotal bruto.", "error");
      return;
    }
    if (discountSafe > subtotal) {
      showToast("El descuento no puede superar el subtotal.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload: ManualSaleCreatePayload = {
        payment_method: paymentMethod,
        total,
        paid_amount: total,
        change_amount: 0,
        cart_discount_value: discountSafe,
        cart_discount_percent: 0,
        customer_id: selectedCustomer && selectedCustomer.id > 0 ? selectedCustomer.id : undefined,
        customer_name: selectedCustomer?.name ?? undefined,
        customer_phone: selectedCustomer?.phone ?? undefined,
        customer_email: selectedCustomer?.email ?? undefined,
        customer_tax_id: selectedCustomer?.tax_id ?? undefined,
        customer_address: selectedCustomer?.address ?? undefined,
        notes: saleNotes.trim() || undefined,
        pos_name: "POS Web - Movimientos",
        items: lines.map((line) => ({
          product_id: line.product_id,
          quantity: line.qty,
          unit_price: line.unit_price,
          unit_price_original: line.unit_price,
          product_sku: line.sku || undefined,
          product_name: line.product_name,
          product_barcode: line.barcode || undefined,
          discount:
            line.qty * line.unit_price > 0
              ? Number(((line.line_discount_value / (line.qty * line.unit_price)) * 100).toFixed(2))
              : 0,
          line_discount_value: line.line_discount_value,
        })),
        payments: [{ method: paymentMethod, amount: total }],
      };

      const sale = await createManualSale(token, payload);
      await closeManualMovementDocument(token, document.id, {
        external_reference_type: "sale",
        external_reference_id: sale.id,
      });
      clearActiveMovementForm();
      router.push("/dashboard/movements?tab=movements");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo registrar la venta", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold leading-none text-slate-900">
            Formulario de venta manual
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Flujo excepcional para registrar una venta con cliente y descuento.
          </p>
        </div>
        <button
          type="button"
          onClick={goBackToMovements}
          className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Volver a movimientos
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {bootLoading ? <p className="px-1 text-sm text-slate-500">Cargando documento...</p> : null}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Documento:</span> {document?.document_number || "Generando..."}
              <span className="mx-2 text-slate-300">|</span>
              <span className="font-semibold">Estado:</span> {headerSaved ? "Encabezado guardado" : "Pendiente"}
            </div>
            {headerSaved ? (
              <button
                type="button"
                onClick={() => setHeaderCollapsed((prev) => !prev)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                {headerCollapsed ? "Editar encabezado" : "Minimizar encabezado"}
              </button>
            ) : null}
          </div>

          {!headerCollapsed ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="text-sm text-slate-700 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>Cliente *</span>
                    {selectedCustomer ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerQuery(selectedCustomer.name);
                          setCustomerModalOpen(true);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Cambiar
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomerModalOpen(true)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {selectedCustomer ? "Cambiar cliente" : "Agregar cliente"}
                    </button>
                    {selectedCustomer ? (
                      <p className="text-sm text-slate-700">
                        Seleccionado: <span className="font-semibold text-slate-900">{selectedCustomer.name}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-rose-600">Obligatorio para guardar la venta.</p>
                    )}
                  </div>
                </div>
                <label className="text-sm text-slate-700">
                  Método de pago
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                    <option value="nequi">Nequi</option>
                    <option value="daviplata">Daviplata</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  Descuento global
                  <input
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="text-sm text-slate-700">
                Notas de venta
                <textarea
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveHeader}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Guardar datos
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Encabezado guardado · Cliente:{" "}
              <span className="font-semibold text-slate-800">
                {selectedCustomer?.name || "Sin cliente"}
              </span>{" "}
              · Método: <span className="font-semibold text-slate-800">{paymentMethod}</span>{" "}
              · Descuento: <span className="font-semibold text-slate-800">{formatMoney(discountSafe)}</span>
            </div>
          )}

          <div className={`rounded-xl border border-slate-200 bg-white ${headerSaved ? "" : "pointer-events-none opacity-50"}`}>
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Agregar productos</p>
            </div>
            <div className="space-y-3 p-4">
              {!headerSaved ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Guarda primero el encabezado para habilitar productos.
                </p>
              ) : null}
              <input
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setSelectedProduct(null);
                }}
                placeholder="Buscar por nombre, SKU o código"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {lookupLoading ? <p className="text-xs text-slate-500">Buscando productos...</p> : null}
              <div className="max-h-48 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {lookup.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-xs text-slate-500">
                          Sin resultados.
                        </td>
                      </tr>
                    ) : (
                      lookup.map((row) => (
                        <tr key={row.product_id}>
                          <td className="px-3 py-2">{row.product_name}</td>
                          <td className="px-3 py-2 text-slate-600">{row.sku || "-"}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(row.price)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProduct(row);
                                setLineQty("1");
                                setLineDiscountValue("0");
                              }}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              Seleccionar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {selectedProduct ? (
                <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 md:grid-cols-5">
                  <p className="text-xs text-emerald-800 md:col-span-2">
                    Producto: <span className="font-semibold">{selectedProduct.product_name}</span>
                  </p>
                  <label className="text-xs text-slate-700">
                    Cantidad
                    <input
                      value={lineQty}
                      onChange={(e) => setLineQty(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      type="number"
                      min="1"
                      step="1"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-700">
                    Descuento línea
                    <input
                      value={lineDiscountValue}
                      onChange={(e) => setLineDiscountValue(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      type="number"
                      min="0"
                      step="1"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="flex items-end justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={addLine}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`rounded-xl border border-slate-200 bg-white ${headerSaved ? "" : "pointer-events-none opacity-50"}`}>
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Productos en venta ({lines.length})</p>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Desc. línea</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-xs text-slate-500">
                        Aún no hay productos agregados.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 text-slate-900">{line.product_name}</td>
                        <td className="px-3 py-2 text-slate-700">{line.sku || "-"}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatQty(line.qty, 0)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatMoney(line.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          <input
                            value={line.line_discount_value}
                            onChange={(e) => updateLineDiscount(line.id, e.target.value)}
                            onBlur={persistCurrentLines}
                            type="number"
                            min="0"
                            step="1"
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-slate-900">
                          {formatMoney(Math.max(0, line.qty * line.unit_price - line.line_discount_value))}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <p className="text-slate-700">Subtotal: <span className="font-semibold text-slate-900">{formatMoney(subtotal)}</span></p>
            <p className="text-slate-700">Descuento: <span className="font-semibold text-slate-900">{formatMoney(lineDiscountTotal + discountSafe)}</span></p>
            <p className="text-slate-700">Total: <span className="font-semibold text-slate-900">{formatMoney(total)}</span></p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                if (token && document?.id) {
                  await cancelManualMovementDocument(token, document.id).catch(() => null);
                }
                clearActiveMovementForm();
                router.push("/dashboard/movements?tab=movements");
              }}
              className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
            >
              Cancelar venta
            </button>
            <button
              type="button"
              onClick={() => void closeSale()}
              disabled={submitting || lines.length === 0}
              className="rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Registrando..." : "Cerrar venta"}
            </button>
          </div>
        </div>
      </section>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{ position: "fixed", top: 20, right: 20, left: "auto", bottom: "auto" }}
          className={`z-[999] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
            toast.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          } ${toastVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
        >
          {toast.message}
        </div>
      ) : null}

      {customerModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Cliente de la venta</h3>
              <button
                type="button"
                onClick={() => setCustomerModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="text-sm text-slate-700">
                  Buscar cliente existente
                  <input
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Escribe al menos 2 caracteres"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                {customerLookupLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Buscando clientes...</p>
                ) : null}
                {customerLookup.length > 0 ? (
                  <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200">
                    {customerLookup.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomerQuery(customer.name);
                          setCustomerLookup([]);
                          setCustomerModalOpen(false);
                        }}
                        className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <span>{customer.name}</span>
                        <span className="text-xs text-slate-500">{customer.phone || customer.email || "-"}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Crear cliente rápido</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <input
                    value={quickCustomerName}
                    onChange={(e) => setQuickCustomerName(e.target.value)}
                    placeholder="Nombre *"
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={quickCustomerPhone}
                    onChange={(e) => setQuickCustomerPhone(e.target.value)}
                    placeholder="Teléfono"
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={quickCustomerEmail}
                    onChange={(e) => setQuickCustomerEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleQuickCreateCustomer()}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Crear y seleccionar cliente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenericMovementForm({ kind }: { kind: Exclude<FormKind, "entrada_manual" | "salida_manual" | "venta_manual"> }) {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdParam = searchParams.get("docId");
  const parsedDocId = docIdParam ? Number(docIdParam) : NaN;
  const [document, setDocument] = useState<ManualMovementDocumentRead | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [productQuery, setProductQuery] = useState("");
  const [lookup, setLookup] = useState<InventoryProductRow[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProductRow | null>(null);

  const [qty, setQty] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"in" | "out">("in");
  const [damageType, setDamageType] = useState<"loss" | "damage">("loss");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const draftDocKey = `${GENERIC_DRAFT_DOC_KEY_PREFIX}_${kind}`;

  useEffect(() => {
    if (!document || document.status !== "open") return;
    persistActiveMovementForm(`/dashboard/movements/form/${kind}?docId=${document.id}`);
  }, [document, kind]);

  const goBackToMovements = useCallback(() => {
    clearActiveMovementForm();
    router.push("/dashboard/movements?tab=movements");
  }, [router]);

  const makeDraftStateKey = useCallback(
    (docId: number) => `${GENERIC_DRAFT_STATE_KEY_PREFIX}_${kind}_${docId}`,
    [kind]
  );

  const clearDraftStorage = useCallback(
    (docId?: number | null) => {
      if (typeof window === "undefined") return;
      if (docId) {
        window.sessionStorage.removeItem(makeDraftStateKey(docId));
      }
      window.sessionStorage.removeItem(draftDocKey);
    },
    [draftDocKey, makeDraftStateKey]
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBootLoading(true);
    const load = async () => {
      try {
        const createAndLoadNew = async () => {
          const created = await createManualMovementDocument(token, {
            kind: kind as ManualMovementDocumentKind,
            origin_name: "Metrik web",
            header: {},
          });
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(draftDocKey, String(created.id));
          }
          router.replace(`/dashboard/movements/form/${kind}?docId=${created.id}`);
          return await fetchManualMovementDocumentDetail(token, created.id);
        };

        const resolveOpenDetail = async (): Promise<ManualMovementDocumentDetail> => {
          if (Number.isFinite(parsedDocId) && parsedDocId > 0) {
            return await fetchManualMovementDocumentDetail(token, parsedDocId);
          }

          if (typeof window !== "undefined") {
            const storedDocIdRaw = window.sessionStorage.getItem(draftDocKey);
            const storedDocId = Number(storedDocIdRaw);
            if (Number.isFinite(storedDocId) && storedDocId > 0) {
              try {
                const storedDetail = await fetchManualMovementDocumentDetail(token, storedDocId);
                if (storedDetail.document.status === "open") {
                  router.replace(`/dashboard/movements/form/${kind}?docId=${storedDocId}`);
                  return storedDetail;
                }
              } catch {
                window.sessionStorage.removeItem(draftDocKey);
              }
            }
          }

          return await createAndLoadNew();
        };

        const detail = await resolveOpenDetail();
        if (cancelled) return;
        setDocument(detail.document);
        if (detail.document.status === "open" && typeof window !== "undefined") {
          window.sessionStorage.setItem(draftDocKey, String(detail.document.id));
          const draftRaw = window.sessionStorage.getItem(makeDraftStateKey(detail.document.id));
          if (draftRaw) {
            try {
              const draft = JSON.parse(draftRaw) as {
                productQuery?: string;
                selectedProduct?: InventoryProductRow | null;
                qty?: string;
                adjustDirection?: "in" | "out";
                damageType?: "loss" | "damage";
                notes?: string;
              };
              setProductQuery(draft.productQuery ?? "");
              setSelectedProduct(draft.selectedProduct ?? null);
              setQty(draft.qty ?? "");
              if (draft.adjustDirection === "in" || draft.adjustDirection === "out") {
                setAdjustDirection(draft.adjustDirection);
              }
              if (draft.damageType === "loss" || draft.damageType === "damage") {
                setDamageType(draft.damageType);
              }
              setNotes(draft.notes ?? "");
            } catch {
              window.sessionStorage.removeItem(makeDraftStateKey(detail.document.id));
            }
          }
        } else {
          clearDraftStorage(detail.document.id);
        }
      } catch (err) {
        if (!cancelled) setFeedback(err instanceof Error ? err.message : "No se pudo cargar el documento");
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, parsedDocId, kind, router, clearDraftStorage, draftDocKey, makeDraftStateKey]);

  useEffect(() => {
    if (!document || document.status !== "open" || typeof window === "undefined") return;
    window.sessionStorage.setItem(draftDocKey, String(document.id));
    window.sessionStorage.setItem(
      makeDraftStateKey(document.id),
      JSON.stringify({
        productQuery,
        selectedProduct,
        qty,
        adjustDirection,
        damageType,
        notes,
      })
    );
  }, [
    document,
    productQuery,
    selectedProduct,
    qty,
    adjustDirection,
    damageType,
    notes,
    draftDocKey,
    makeDraftStateKey,
  ]);

  useEffect(() => {
    if (!token) return;
    const query = productQuery.trim();
    const looksLikeCode = /^[0-9]+$/.test(query);
    if (query.length < 2 && !looksLikeCode) {
      setLookup([]);
      return;
    }

    let cancelled = false;
    setLookupLoading(true);
    const handle = setTimeout(() => {
      fetchInventoryProducts(token, {
        skip: 0,
        limit: 25,
        search: query,
        sort: "name_asc",
      })
        .then((data) => {
          if (!cancelled) setLookup(data.items);
        })
        .catch(() => {
          if (!cancelled) setLookup([]);
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [token, productQuery]);

  const submit = async () => {
    if (!token || !document) return;
    const parsedQty = Number(qty.replace(",", "."));

    if (!selectedProduct) {
      setFeedback("Selecciona un producto.");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setFeedback("La cantidad debe ser mayor a 0.");
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      await updateManualMovementDocumentHeader(token, document.id, {
        header: {
          movement_type: kind,
          adjust_direction: adjustDirection,
          damage_type: damageType,
        },
        notes: notes.trim() || undefined,
      });
      await replaceManualMovementDocumentLines(token, document.id, {
        lines: [
          {
            product_id: selectedProduct.product_id,
            qty: Math.abs(parsedQty),
            notes: notes.trim() || undefined,
          },
        ],
      });
      await closeManualMovementDocument(token, document.id);
      clearDraftStorage(document.id);
      clearActiveMovementForm();
      setFeedback("Movimiento registrado correctamente.");
      router.push("/dashboard/movements?tab=movements");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Error registrando movimiento");
    } finally {
      setSubmitting(false);
    }
  };

  const meta = formMeta[kind];

  return (
    <div className="space-y-4">
      <section className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-semibold leading-none text-slate-900">{meta.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{meta.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={goBackToMovements}
          className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Volver a movimientos
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold">Documento:</span> {document?.document_number || "Generando..."}
            {bootLoading ? <span className="ml-2 text-slate-500">Cargando…</span> : null}
          </div>
          <label className="block text-sm text-slate-700">
            Producto
            <input
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                setSelectedProduct(null);
              }}
              placeholder="Buscar por nombre, SKU o código"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {lookupLoading ? <p className="text-xs text-slate-500">Buscando producto...</p> : null}
          {!selectedProduct ? (
            <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lookup.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-xs text-slate-500">
                        {productQuery.trim().length === 0
                          ? "Escribe nombre, SKU o código de barras."
                          : "Sin resultados."}
                      </td>
                    </tr>
                  ) : (
                    lookup.map((row) => (
                      <tr key={row.product_id}>
                        <td className="px-3 py-2">{row.product_name}</td>
                        <td className="px-3 py-2 text-slate-600">{row.sku || "-"}</td>
                        <td className="px-3 py-2 text-slate-600">{row.barcode || "-"}</td>
                        <td className="px-3 py-2 text-right">{formatQty(row.qty_on_hand)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(row);
                              setProductQuery(row.product_name);
                              setLookup([]);
                            }}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          >
                            Seleccionar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <div className="flex items-center justify-between gap-2">
                <span>
                  Seleccionado: <span className="font-semibold">{selectedProduct.product_name}</span>{" "}
                  · SKU: {selectedProduct.sku || "-"} · Código: {selectedProduct.barcode || "-"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setProductQuery("");
                    setLookup([]);
                  }}
                  className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-800"
                >
                  Cambiar
                </button>
              </div>
            </div>
          )}

          <label className="block text-sm text-slate-700">
            Cantidad
            <input
              value={qty}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || /^[0-9]+([.,][0-9]*)?$/.test(value)) {
                  setQty(value);
                }
              }}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {kind === "ajuste" ? (
            <label className="block text-sm text-slate-700">
              Dirección
              <select
                value={adjustDirection}
                onChange={(e) => setAdjustDirection(e.target.value as "in" | "out")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="in">Incrementar stock</option>
                <option value="out">Disminuir stock</option>
              </select>
            </label>
          ) : null}

          {kind === "perdida_dano" ? (
            <label className="block text-sm text-slate-700">
              Motivo
              <select
                value={damageType}
                onChange={(e) => setDamageType(e.target.value as "loss" | "damage")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="loss">Pérdida</option>
                <option value="damage">Daño</option>
              </select>
            </label>
          ) : null}

          <label className="block text-sm text-slate-700">
            Notas
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>

          {feedback ? <p className="text-sm text-slate-700">{feedback}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={goBackToMovements}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Registrando..." : "Registrar movimiento"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatQty(value: number, maxDigits = 2) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
