"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import {
  convertComercioWebOrderToSale,
  fetchComercioWebOrders,
  recordComercioWebPayment,
  type ComercioWebOrder,
  type ComercioWebOrderPayment,
  type ComercioWebPaymentStatus,
  type ComercioWebOrderStatus,
  updateComercioWebOrderStatus,
} from "@/lib/api/comercioWeb";
import {
  fetchComercioWebCatalogProducts,
  updateComercioWebCatalogProduct,
  type ComercioWebCatalogProduct,
  type ComercioWebCatalogProductUpdate,
} from "@/lib/api/comercioWebCatalog";
import {
  defaultRolePermissions,
  fetchRolePermissions,
  type RolePermissionModule,
} from "@/lib/api/settings";

type CommerceTab = "overview" | "catalog" | "orders" | "payments" | "customers";

type PaymentRow = {
  paymentId: number;
  orderId: number;
  orderDocument: string;
  customerName: string;
  customerEmail: string;
  method: string;
  provider: string;
  amount: number;
  status: string;
  createdAt: string;
};

type CustomerRow = {
  key: string;
  name: string;
  email: string;
  phone: string;
  orders: number;
  total: number;
  approved: number;
  converted: number;
  lastOrderAt: string;
};

type CatalogEditorState = {
  web_name: string;
  web_slug: string;
  web_published: boolean;
  web_featured: boolean;
  web_short_description: string;
  web_long_description: string;
  web_compare_price: string;
  web_badge_text: string;
  web_sort_order: string;
  web_visible_when_out_of_stock: boolean;
  web_price_mode: "visible" | "consultar";
  web_whatsapp_message: string;
  image_url: string;
  image_thumb_url: string;
};

const TABS: Array<{ id: CommerceTab; label: string; description: string }> = [
  {
    id: "overview",
    label: "Resumen",
    description: "Cola operativa, salud documental y pendientes inmediatos.",
  },
  {
    id: "catalog",
    label: "Catálogo Web",
    description: "Publicación comercial, descuentos, textos e imagen de tienda.",
  },
  {
    id: "orders",
    label: "Órdenes",
    description: "Detalle documental, timeline y acciones por orden.",
  },
  {
    id: "payments",
    label: "Pagos",
    description: "Ledger interno de pagos registrados sobre órdenes web.",
  },
  {
    id: "customers",
    label: "Clientes",
    description: "Lectura comercial de compradores del canal web.",
  },
];

const ORDER_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "pending_payment", label: "Pendiente de pago" },
  { value: "paid", label: "Pagada" },
  { value: "processing", label: "En proceso" },
  { value: "ready", label: "Lista" },
  { value: "fulfilled", label: "Entregada" },
  { value: "payment_failed", label: "Pago fallido" },
  { value: "cancelled", label: "Cancelada" },
];

const PAYMENT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos los pagos" },
  { value: "pending", label: "Pendiente" },
  { value: "approved", label: "Aprobado" },
  { value: "failed", label: "Fallido" },
  { value: "cancelled", label: "Cancelado" },
  { value: "refunded", label: "Reembolsado" },
];

const OPERATIVE_STATUS_OPTIONS: Array<{
  value: ComercioWebOrderStatus;
  label: string;
}> = [
  { value: "processing", label: "Mover a proceso" },
  { value: "ready", label: "Marcar lista" },
  { value: "fulfilled", label: "Marcar entregada" },
  { value: "cancelled", label: "Cancelar orden" },
];

const emptyCatalogEditorState: CatalogEditorState = {
  web_name: "",
  web_slug: "",
  web_published: false,
  web_featured: false,
  web_short_description: "",
  web_long_description: "",
  web_compare_price: "",
  web_badge_text: "",
  web_sort_order: "0",
  web_visible_when_out_of_stock: true,
  web_price_mode: "visible",
  web_whatsapp_message: "",
  image_url: "",
  image_thumb_url: "",
};

function formatMoney(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "paid":
    case "ready":
    case "fulfilled":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "processing":
      return "border-sky-300 bg-sky-50 text-sky-700";
    case "pending":
    case "pending_payment":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "failed":
    case "payment_failed":
    case "cancelled":
    case "refunded":
      return "border-rose-300 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function sumApprovedPayments(order: ComercioWebOrder): number {
  return order.payments
    .filter((payment) => payment.status === "approved")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function getPrimaryContact(order: ComercioWebOrder): string {
  return order.customer_phone || order.customer_email || "Sin contacto";
}

function getCatalogDisplayName(product: ComercioWebCatalogProduct): string {
  return product.web_name?.trim() || product.name;
}

function hasVisibleDiscount(product: ComercioWebCatalogProduct): boolean {
  return (
    product.web_price_mode === "visible" &&
    typeof product.web_compare_price === "number" &&
    product.web_compare_price > product.price
  );
}

function buildEditorState(product: ComercioWebCatalogProduct | null): CatalogEditorState {
  if (!product) return emptyCatalogEditorState;
  return {
    web_name: product.web_name || "",
    web_slug: product.web_slug || "",
    web_published: Boolean(product.web_published),
    web_featured: Boolean(product.web_featured),
    web_short_description: product.web_short_description || "",
    web_long_description: product.web_long_description || "",
    web_compare_price:
      typeof product.web_compare_price === "number" ? String(product.web_compare_price) : "",
    web_badge_text: product.web_badge_text || "",
    web_sort_order: String(product.web_sort_order ?? 0),
    web_visible_when_out_of_stock: Boolean(product.web_visible_when_out_of_stock),
    web_price_mode: product.web_price_mode || "visible",
    web_whatsapp_message: product.web_whatsapp_message || "",
    image_url: product.image_url || "",
    image_thumb_url: product.image_thumb_url || "",
  };
}

function MetricCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
  hint?: string;
}) {
  const toneClasses =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-rose-600"
          : "text-slate-900";
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClasses}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function ComercioWebPage() {
  const { token, user, tenant } = useAuth();
  const [activeTab, setActiveTab] = useState<CommerceTab>("overview");

  const [orders, setOrders] = useState<ComercioWebOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [publishedCatalogProducts, setPublishedCatalogProducts] = useState<
    ComercioWebCatalogProduct[]
  >([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogSearchTerm, setCatalogSearchTerm] = useState("");
  const [catalogSearchResults, setCatalogSearchResults] = useState<ComercioWebCatalogProduct[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogSearchExecuted, setCatalogSearchExecuted] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [catalogEditor, setCatalogEditor] = useState<CatalogEditorState>(emptyCatalogEditorState);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [catalogSuccess, setCatalogSuccess] = useState<string | null>(null);

  const [roleModules, setRoleModules] = useState<RolePermissionModule[]>(defaultRolePermissions);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchRolePermissions(token)
      .then((modules) => {
        if (active) setRoleModules(modules);
      })
      .catch(() => {
        if (active) setRoleModules(defaultRolePermissions);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const commerceModule = useMemo(
    () => roleModules.find((module) => module.id === "commerce_web"),
    [roleModules]
  );

  const canManage = useMemo(() => {
    if (!user || !commerceModule) return false;
    const action = commerceModule.actions.find((item) => item.id === "commerce_web.manage");
    if (action) return Boolean(action.roles[user.role as keyof typeof action.roles]);
    return Boolean(commerceModule.roles[user.role as keyof typeof commerceModule.roles]);
  }, [commerceModule, user]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  const selectedProduct = useMemo(
    () =>
      publishedCatalogProducts.find((product) => product.id === selectedProductId) ??
      catalogSearchResults.find((product) => product.id === selectedProductId) ??
      null,
    [catalogSearchResults, publishedCatalogProducts, selectedProductId]
  );

  useEffect(() => {
    setCatalogEditor(buildEditorState(selectedProduct));
    setCatalogDirty(false);
    setCatalogSuccess(null);
  }, [selectedProduct]);

  const paymentRows = useMemo<PaymentRow[]>(
    () =>
      orders
        .flatMap((order) =>
          order.payments.map((payment) => ({
            paymentId: payment.id,
            orderId: order.id,
            orderDocument: order.document_number || `Orden #${order.id}`,
            customerName: order.customer_name || "Cliente web",
            customerEmail: order.customer_email || "Sin correo",
            method: payment.method || "Sin método",
            provider: payment.provider || "Sin proveedor",
            amount: Number(payment.amount || 0),
            status: payment.status,
            createdAt: payment.created_at,
          }))
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  const customerRows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();
    for (const order of orders) {
      const key = order.customer_email || order.customer_phone || `account-${order.account_id}`;
      const approved = sumApprovedPayments(order);
      const current = map.get(key) ?? {
        key,
        name: order.customer_name || "Cliente web",
        email: order.customer_email || "Sin correo",
        phone: order.customer_phone || "Sin teléfono",
        orders: 0,
        total: 0,
        approved: 0,
        converted: 0,
        lastOrderAt: order.created_at,
      };
      current.orders += 1;
      current.total += Number(order.total || 0);
      current.approved += approved;
      current.converted += order.sale_id ? 1 : 0;
      if (new Date(order.created_at).getTime() > new Date(current.lastOrderAt).getTime()) {
        current.lastOrderAt = order.created_at;
      }
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [orders]);

  const orderMetrics = useMemo(() => {
    const pendingPayment = orders.filter((order) => order.status === "pending_payment").length;
    const paid = orders.filter((order) => order.payment_status === "approved").length;
    const readyToConvert = orders.filter(
      (order) => order.payment_status === "approved" && order.sale_id == null
    ).length;
    const converted = orders.filter((order) => order.sale_id != null).length;
    const inFulfillment = orders.filter((order) =>
      ["processing", "ready"].includes(order.status)
    ).length;
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const approvedAmount = orders.reduce((sum, order) => sum + sumApprovedPayments(order), 0);
    return {
      pendingPayment,
      paid,
      readyToConvert,
      converted,
      inFulfillment,
      total,
      approvedAmount,
    };
  }, [orders]);

  const catalogMetrics = useMemo(() => {
    const published = publishedCatalogProducts.length;
    const featured = publishedCatalogProducts.filter((product) => product.web_featured).length;
    const discounted = publishedCatalogProducts.filter((product) => hasVisibleDiscount(product)).length;
    const consult = publishedCatalogProducts.filter(
      (product) => product.web_price_mode === "consultar"
    ).length;
    return { published, featured, discounted, consult };
  }, [publishedCatalogProducts]);

  const pendingPaymentOrders = useMemo(
    () => orders.filter((order) => order.status === "pending_payment").slice(0, 6),
    [orders]
  );
  const readyToConvertOrders = useMemo(
    () =>
      orders
        .filter((order) => order.payment_status === "approved" && order.sale_id == null)
        .slice(0, 6),
    [orders]
  );
  const fulfillmentQueue = useMemo(
    () => orders.filter((order) => ["processing", "ready"].includes(order.status)).slice(0, 6),
    [orders]
  );

  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingOrders(true);
      setOrderError(null);
      const rows = await fetchComercioWebOrders(token, {
        status: status || undefined,
        payment_status: paymentStatus || undefined,
        search: search.trim() || undefined,
        limit: 120,
      });
      setOrders(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo cargar Comercio Web");
    } finally {
      setLoadingOrders(false);
    }
  }, [paymentStatus, search, status, token]);

  const loadCatalogProducts = useCallback(async () => {
    if (!token) return;
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const rows = await fetchComercioWebCatalogProducts(token, {
        published_only: true,
        limit: 200,
      });
      setPublishedCatalogProducts(rows);
      setSelectedProductId((prev) => {
        if (prev && rows.some((product) => product.id === prev)) return prev;
        return prev ?? rows[0]?.id ?? null;
      });
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo cargar el catálogo web");
    } finally {
      setCatalogLoading(false);
    }
  }, [token]);

  const searchCatalogProducts = useCallback(async () => {
    if (!token) return;
    const term = catalogSearchTerm.trim();
    if (!term) {
      setCatalogSearchResults([]);
      setCatalogSearchExecuted(false);
      return;
    }
    try {
      setCatalogSearching(true);
      setCatalogError(null);
      const rows = await fetchComercioWebCatalogProducts(token, {
        q: term,
        limit: 40,
      });
      setCatalogSearchResults(rows);
      setCatalogSearchExecuted(true);
      setSelectedProductId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo buscar en la base maestra");
    } finally {
      setCatalogSearching(false);
    }
  }, [catalogSearchTerm, token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (activeTab !== "catalog") return;
    void loadCatalogProducts();
  }, [activeTab, loadCatalogProducts]);

  async function handleApprovePayment(order: ComercioWebOrder) {
    if (!token) return;
    const remaining = Math.max(0, Number(order.total || 0) - sumApprovedPayments(order));
    if (remaining <= 0) return;
    try {
      setBusyAction(`pay-${order.id}`);
      const updated = await recordComercioWebPayment(token, order.id, {
        method: "online",
        amount: remaining,
        provider: "manual_backoffice",
        status: "approved" as ComercioWebPaymentStatus,
        note: "Pago aprobado manualmente desde Comercio Web",
      });
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo registrar el pago");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStatusUpdate(order: ComercioWebOrder, nextStatus: ComercioWebOrderStatus) {
    if (!token) return;
    try {
      setBusyAction(`status-${order.id}-${nextStatus}`);
      const updated = await updateComercioWebOrderStatus(token, order.id, {
        status: nextStatus,
        note: `Estado actualizado a ${nextStatus} desde Comercio Web`,
      });
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConvert(order: ComercioWebOrder) {
    if (!token) return;
    try {
      setBusyAction(`convert-${order.id}`);
      const updated = await convertComercioWebOrderToSale(token, order.id, {
        note: "Conversión iniciada desde el módulo Comercio Web",
      });
      setOrders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedId(updated.id);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "No se pudo convertir la orden");
    } finally {
      setBusyAction(null);
    }
  }

  function handleCatalogField<K extends keyof CatalogEditorState>(
    key: K,
    value: CatalogEditorState[K]
  ) {
    setCatalogEditor((prev) => ({ ...prev, [key]: value }));
    setCatalogDirty(true);
    setCatalogSuccess(null);
  }

  async function handleSaveCatalogProduct() {
    if (!token || !selectedProduct) return;
    const payload: ComercioWebCatalogProductUpdate = {
      web_name: catalogEditor.web_name.trim() || undefined,
      web_slug: catalogEditor.web_slug.trim() || undefined,
      web_published: catalogEditor.web_published,
      web_featured: catalogEditor.web_featured,
      web_short_description: catalogEditor.web_short_description.trim() || undefined,
      web_long_description: catalogEditor.web_long_description.trim() || undefined,
      web_compare_price: catalogEditor.web_compare_price.trim()
        ? Number(catalogEditor.web_compare_price)
        : undefined,
      web_badge_text: catalogEditor.web_badge_text.trim() || undefined,
      web_sort_order: Number(catalogEditor.web_sort_order || "0"),
      web_visible_when_out_of_stock: catalogEditor.web_visible_when_out_of_stock,
      web_price_mode: catalogEditor.web_price_mode,
      web_whatsapp_message: catalogEditor.web_whatsapp_message.trim() || undefined,
      image_url: catalogEditor.image_url.trim() || undefined,
      image_thumb_url: catalogEditor.image_thumb_url.trim() || undefined,
    };
    try {
      setCatalogSaving(true);
      setCatalogError(null);
      const updated = await updateComercioWebCatalogProduct(token, selectedProduct.id, payload);
      setPublishedCatalogProducts((prev) => {
        const exists = prev.some((row) => row.id === updated.id);
        if (updated.web_published) {
          if (exists) return prev.map((row) => (row.id === updated.id ? updated : row));
          return [updated, ...prev];
        }
        return prev.filter((row) => row.id !== updated.id);
      });
      setCatalogSearchResults((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row))
      );
      setSelectedProductId(updated.id);
      setCatalogDirty(false);
      setCatalogSuccess("Producto de catálogo web actualizado.");
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo guardar el producto");
    } finally {
      setCatalogSaving(false);
    }
  }

  async function handleQuickCatalogToggle(
    product: ComercioWebCatalogProduct,
    field: "web_published" | "web_featured",
    value: boolean
  ) {
    if (!token || !canManage) return;
    try {
      setCatalogError(null);
      const updated = await updateComercioWebCatalogProduct(token, product.id, {
        [field]: value,
      });
      setPublishedCatalogProducts((prev) => {
        const exists = prev.some((row) => row.id === updated.id);
        if (updated.web_published) {
          if (exists) return prev.map((row) => (row.id === updated.id ? updated : row));
          return [updated, ...prev];
        }
        return prev.filter((row) => row.id !== updated.id);
      });
      setCatalogSearchResults((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row))
      );
      if (selectedProductId === updated.id) {
        setSelectedProductId(updated.id);
      }
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "No se pudo actualizar el producto");
    }
  }

  const selectedRemaining = selectedOrder
    ? Math.max(0, Number(selectedOrder.total || 0) - sumApprovedPayments(selectedOrder))
    : 0;

  return (
    <main className="flex-1 min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-emerald-600">
                Comercio Web
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">
                Operación web integrada dentro de Metrik
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Aquí concentras publicación comercial, órdenes `OW`, pagos web,
                fulfillment y conversión controlada a tickets `V` cuando la venta ya
                está consolidada.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[28rem]">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">
                  Tenant activo
                </p>
                <p className="mt-1 text-sm font-semibold text-emerald-900">
                  {tenant?.name || "Empresa activa"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Alcance del rol
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {canManage ? "Operación completa" : "Solo consulta"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Pendientes de pago"
            value={String(orderMetrics.pendingPayment)}
            tone="warning"
          />
          <MetricCard label="Pagadas" value={String(orderMetrics.paid)} tone="success" />
          <MetricCard
            label="Publicadas web"
            value={String(catalogMetrics.published)}
            hint={`${catalogMetrics.featured} destacadas`}
          />
          <MetricCard
            label="Con descuento visible"
            value={String(catalogMetrics.discounted)}
            hint={`${catalogMetrics.consult} en modo consultar`}
          />
          <MetricCard
            label="Valor OW visible"
            value={formatMoney(orderMetrics.total)}
            hint={`Aprobado: ${formatMoney(orderMetrics.approvedAmount)}`}
          />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.4fr,1fr,1fr,auto,auto]">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setSearch(searchInput);
              }}
              placeholder="Buscar por OW, cliente, correo o teléfono"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            >
              {ORDER_STATUS_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
            >
              {PAYMENT_STATUS_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSearch(searchInput)}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400"
            >
              Aplicar filtro
            </button>
            <button
              type="button"
              onClick={() => {
                void loadOrders();
                if (activeTab === "catalog") void loadCatalogProducts();
              }}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Refrescar
            </button>
          </div>
          {orderError ? <p className="mt-3 text-sm text-rose-600">{orderError}</p> : null}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-2 lg:grid-cols-5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  activeTab === tab.id
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200"
                }`}
              >
                <p className="text-sm font-semibold">{tab.label}</p>
                <p className="mt-1 text-xs leading-5 text-current/75">{tab.description}</p>
              </button>
            ))}
          </div>
        </section>

        {activeTab === "overview" ? (
          <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-6">
              <SectionCard
                title="Cola operativa"
                subtitle="Lo que el equipo debe resolver hoy dentro del canal web."
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <SummaryBox
                    title="Por cobrar"
                    value={pendingPaymentOrders.length}
                    caption="Órdenes aún sin pago aprobado."
                    tone="warning"
                  />
                  <SummaryBox
                    title="Por convertir"
                    value={readyToConvertOrders.length}
                    caption="Pago aprobado, falta ticket V."
                    tone="info"
                  />
                  <SummaryBox
                    title="En fulfillment"
                    value={fulfillmentQueue.length}
                    caption="Órdenes en proceso o listas."
                    tone="success"
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Pendientes inmediatos"
                subtitle="Una vista táctica para iniciar operación sin revisar orden por orden."
              >
                <div className="space-y-5">
                  <QueueList
                    title="Cobros pendientes"
                    emptyMessage="No hay cobros pendientes."
                    orders={pendingPaymentOrders}
                    onSelect={setSelectedId}
                    onJump={() => setActiveTab("orders")}
                    highlight="warning"
                  />
                  <QueueList
                    title="Órdenes listas para convertir"
                    emptyMessage="No hay órdenes con pago aprobado pendientes de ticket."
                    orders={readyToConvertOrders}
                    onSelect={setSelectedId}
                    onJump={() => setActiveTab("orders")}
                    highlight="info"
                  />
                  <QueueList
                    title="Fulfillment activo"
                    emptyMessage="No hay órdenes en preparación o listas para entrega."
                    orders={fulfillmentQueue}
                    onSelect={setSelectedId}
                    onJump={() => setActiveTab("orders")}
                    highlight="success"
                  />
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard
                title="Distribución documental"
                subtitle="Cómo se mueve el canal web dentro del flujo operativo."
              >
                <div className="space-y-3">
                  <DistributionRow
                    label="Pendiente de pago"
                    count={orders.filter((order) => order.status === "pending_payment").length}
                    total={orders.length}
                    color="bg-amber-500"
                  />
                  <DistributionRow
                    label="Pagada"
                    count={orders.filter((order) => order.status === "paid").length}
                    total={orders.length}
                    color="bg-emerald-500"
                  />
                  <DistributionRow
                    label="En proceso"
                    count={orders.filter((order) => order.status === "processing").length}
                    total={orders.length}
                    color="bg-sky-500"
                  />
                  <DistributionRow
                    label="Lista"
                    count={orders.filter((order) => order.status === "ready").length}
                    total={orders.length}
                    color="bg-violet-500"
                  />
                  <DistributionRow
                    label="Entregada"
                    count={orders.filter((order) => order.status === "fulfilled").length}
                    total={orders.length}
                    color="bg-slate-700"
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Salud del catálogo"
                subtitle="Estado comercial del subconjunto publicado en tienda."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricCard label="Publicados" value={String(catalogMetrics.published)} />
                  <MetricCard label="Destacados" value={String(catalogMetrics.featured)} />
                  <MetricCard label="Con descuento" value={String(catalogMetrics.discounted)} />
                  <MetricCard label="Solo consultar" value={String(catalogMetrics.consult)} />
                </div>
              </SectionCard>
            </div>
          </section>
        ) : null}

        {activeTab === "catalog" ? (
          <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <SectionCard
              title="Catálogo de publicación"
              subtitle="Gestiona solo lo publicado y usa búsqueda sobre la base maestra para escoger nuevos productos."
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Publicados ahora
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Solo se carga el subconjunto activo en tienda. El inventario maestro completo
                    se consulta únicamente por búsqueda.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <SummaryMini label="Publicados" value={catalogMetrics.published} />
                    <SummaryMini label="Destacados" value={catalogMetrics.featured} />
                    <SummaryMini label="Descuento" value={catalogMetrics.discounted} />
                    <SummaryMini label="Consultar" value={catalogMetrics.consult} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadCatalogProducts()}
                    className="mt-4 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                  >
                    Refrescar publicados
                  </button>
                </div>

                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    Buscar en base maestra
                  </p>
                  <p className="mt-2 text-sm text-emerald-900/80">
                    Busca por SKU, nombre, marca, grupo o código de barras y selecciona el
                    producto para construir su publicación comercial.
                  </p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,auto]">
                    <input
                      value={catalogSearchTerm}
                      onChange={(event) => setCatalogSearchTerm(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void searchCatalogProducts();
                      }}
                      placeholder="Buscar por SKU, nombre, marca o código"
                      className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => void searchCatalogProducts()}
                      className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      {catalogSearching ? "Buscando..." : "Buscar producto"}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-900/75">
                    <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1">
                      Resultados solo bajo demanda
                    </span>
                    {catalogSearchExecuted ? (
                      <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1">
                        {catalogSearchResults.length} coincidencia
                        {catalogSearchResults.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {catalogError ? <p className="mt-3 text-sm text-rose-600">{catalogError}</p> : null}

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Productos publicados</h3>
                    <span className="text-xs text-slate-500">
                      {publishedCatalogProducts.length} visibles en tienda
                    </span>
                  </div>
                  {catalogLoading ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                      Cargando productos publicados…
                    </div>
                  ) : publishedCatalogProducts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                      Aún no hay productos publicados. Usa la búsqueda para escoger uno y crear la publicación.
                    </div>
                  ) : (
                    publishedCatalogProducts.map((product) => (
                      <div
                        key={`published-${product.id}`}
                        className={`rounded-3xl border px-4 py-4 transition ${
                          selectedProductId === product.id
                            ? "border-emerald-300 bg-emerald-50/70"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedProductId(product.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-slate-900">
                                  {getCatalogDisplayName(product)}
                                </span>
                                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                  publicado
                                </span>
                                {product.web_featured ? (
                                  <span className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                                    destacado
                                  </span>
                                ) : null}
                                {product.web_badge_text ? (
                                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                    {product.web_badge_text}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-sm text-slate-700">
                                {product.sku || "sin SKU"} · {product.brand || "sin marca"} ·{" "}
                                {product.group_name || "sin grupo"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {product.web_short_description || "Sin descripción comercial"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">
                                {product.web_price_mode === "visible"
                                  ? formatMoney(product.price)
                                  : "Consultar"}
                              </p>
                              {hasVisibleDiscount(product) ? (
                                <p className="mt-1 text-xs text-slate-500 line-through">
                                  {formatMoney(product.web_compare_price || 0)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              void handleQuickCatalogToggle(product, "web_published", false)
                            }
                            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Ocultar
                          </button>
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              void handleQuickCatalogToggle(
                                product,
                                "web_featured",
                                !product.web_featured
                              )
                            }
                            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {product.web_featured ? "Quitar destacado" : "Destacar"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Resultados de búsqueda</h3>
                    <span className="text-xs text-slate-500">
                      {catalogSearchExecuted
                        ? `${catalogSearchResults.length} coincidencias`
                        : "Busca un producto para empezar"}
                    </span>
                  </div>
                  {!catalogSearchExecuted ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                      La base maestra no se lista completa. Busca el producto que quieras convertir en publicación.
                    </div>
                  ) : catalogSearchResults.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500">
                      No encontramos productos para ese criterio.
                    </div>
                  ) : (
                    catalogSearchResults.map((product) => (
                      <div
                        key={`search-${product.id}`}
                        className={`rounded-3xl border px-4 py-4 transition ${
                          selectedProductId === product.id
                            ? "border-emerald-300 bg-emerald-50/70"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedProductId(product.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-slate-900">
                                  {getCatalogDisplayName(product)}
                                </span>
                                {product.web_published ? (
                                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                    ya publicado
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                    no publicado
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-sm text-slate-700">
                                {product.sku || "sin SKU"} · {product.brand || "sin marca"} ·{" "}
                                {product.group_name || "sin grupo"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {product.web_short_description || "Sin descripción comercial"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-900">
                                {formatMoney(product.price)}
                              </p>
                            </div>
                          </div>
                        </button>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedProductId(product.id)}
                            className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition"
                          >
                            Seleccionar
                          </button>
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() =>
                              void handleQuickCatalogToggle(product, "web_published", true)
                            }
                            className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {product.web_published ? "Mantener publicado" : "Crear publicación"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Editor comercial"
              subtitle="Cómo se presenta realmente el producto en la tienda, distinto al dato operativo interno."
            >
              {!selectedProduct ? (
                <div className="text-sm text-slate-500">
                  Selecciona un producto para editar su publicación web.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <LabeledField label="Nombre público">
                          <input
                            value={catalogEditor.web_name}
                            onChange={(event) => handleCatalogField("web_name", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Slug web">
                          <input
                            value={catalogEditor.web_slug}
                            onChange={(event) => handleCatalogField("web_slug", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <LabeledField label="Precio actual">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
                            {formatMoney(selectedProduct.price)}
                          </div>
                        </LabeledField>
                        <LabeledField label="Precio comparativo">
                          <input
                            value={catalogEditor.web_compare_price}
                            onChange={(event) =>
                              handleCatalogField("web_compare_price", event.target.value)
                            }
                            placeholder="Ej: 120000"
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Badge comercial">
                          <input
                            value={catalogEditor.web_badge_text}
                            onChange={(event) =>
                              handleCatalogField("web_badge_text", event.target.value)
                            }
                            placeholder="Oferta, Nuevo, Top ventas"
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <LabeledField label="Descripción corta">
                          <textarea
                            value={catalogEditor.web_short_description}
                            onChange={(event) =>
                              handleCatalogField("web_short_description", event.target.value)
                            }
                            rows={3}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Descripción larga">
                          <textarea
                            value={catalogEditor.web_long_description}
                            onChange={(event) =>
                              handleCatalogField("web_long_description", event.target.value)
                            }
                            rows={5}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <LabeledField label="Imagen principal">
                          <input
                            value={catalogEditor.image_url}
                            onChange={(event) => handleCatalogField("image_url", event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <LabeledField label="Imagen miniatura">
                          <input
                            value={catalogEditor.image_thumb_url}
                            onChange={(event) =>
                              handleCatalogField("image_thumb_url", event.target.value)
                            }
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-4">
                        <LabeledField label="Modo precio">
                          <select
                            value={catalogEditor.web_price_mode}
                            onChange={(event) =>
                              handleCatalogField(
                                "web_price_mode",
                                event.target.value as "visible" | "consultar"
                              )
                            }
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          >
                            <option value="visible">Visible</option>
                            <option value="consultar">Consultar</option>
                          </select>
                        </LabeledField>
                        <LabeledField label="Orden">
                          <input
                            value={catalogEditor.web_sort_order}
                            onChange={(event) =>
                              handleCatalogField("web_sort_order", event.target.value)
                            }
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                        <ToggleField
                          label="Publicado"
                          checked={catalogEditor.web_published}
                          onChange={(checked) => handleCatalogField("web_published", checked)}
                        />
                        <ToggleField
                          label="Destacado"
                          checked={catalogEditor.web_featured}
                          onChange={(checked) => handleCatalogField("web_featured", checked)}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <ToggleField
                          label="Visible sin stock"
                          checked={catalogEditor.web_visible_when_out_of_stock}
                          onChange={(checked) =>
                            handleCatalogField("web_visible_when_out_of_stock", checked)
                          }
                        />
                        <LabeledField label="Mensaje WhatsApp">
                          <input
                            value={catalogEditor.web_whatsapp_message}
                            onChange={(event) =>
                              handleCatalogField("web_whatsapp_message", event.target.value)
                            }
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-400"
                          />
                        </LabeledField>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={!canManage || !catalogDirty || catalogSaving}
                          onClick={() => void handleSaveCatalogProduct()}
                          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {catalogSaving ? "Guardando..." : "Guardar publicación"}
                        </button>
                        <button
                          type="button"
                          disabled={catalogSaving}
                          onClick={() => {
                            setCatalogEditor(buildEditorState(selectedProduct));
                            setCatalogDirty(false);
                            setCatalogSuccess(null);
                          }}
                          className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Revertir cambios
                        </button>
                      </div>
                      {catalogSuccess ? (
                        <p className="text-sm text-emerald-700">{catalogSuccess}</p>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Vista previa de card
                        </p>
                        <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
                            {catalogEditor.image_url || catalogEditor.image_thumb_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={catalogEditor.image_url || catalogEditor.image_thumb_url}
                                alt={getCatalogDisplayName(selectedProduct)}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.18em] text-slate-400">
                                Sin imagen
                              </div>
                            )}
                          </div>
                          <div className="mt-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              {catalogEditor.web_badge_text ? (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                                  {catalogEditor.web_badge_text}
                                </span>
                              ) : null}
                              {catalogEditor.web_featured ? (
                                <span className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                                  Destacado
                                </span>
                              ) : null}
                            </div>
                            <h3 className="mt-3 text-lg font-semibold text-slate-900">
                              {catalogEditor.web_name.trim() || selectedProduct.name}
                            </h3>
                            <p className="mt-2 text-sm text-slate-600">
                              {catalogEditor.web_short_description.trim() || "Sin descripción comercial."}
                            </p>
                            <div className="mt-4 flex items-end gap-3">
                              <span className="text-xl font-semibold text-slate-900">
                                {catalogEditor.web_price_mode === "visible"
                                  ? formatMoney(selectedProduct.price)
                                  : "Consultar"}
                              </span>
                              {catalogEditor.web_price_mode === "visible" &&
                              catalogEditor.web_compare_price.trim() ? (
                                <span className="text-sm text-slate-400 line-through">
                                  {formatMoney(Number(catalogEditor.web_compare_price))}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Contexto operativo
                        </p>
                        <div className="mt-4 space-y-3 text-sm text-slate-700">
                          <div className="flex items-center justify-between">
                            <span>Producto maestro</span>
                            <span className="font-medium">{selectedProduct.name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>SKU</span>
                            <span className="font-medium">{selectedProduct.sku || "Sin SKU"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Marca</span>
                            <span className="font-medium">{selectedProduct.brand || "Sin marca"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Grupo</span>
                            <span className="font-medium">
                              {selectedProduct.group_name || "Sin grupo"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Precio base</span>
                            <span className="font-medium">{formatMoney(selectedProduct.price)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </section>
        ) : null}

        {activeTab === "orders" ? (
          <section className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
            <SectionCard title="Listado de órdenes" subtitle="Documentos `OW` creados por el canal web.">
              {loadingOrders ? (
                <div className="py-8 text-sm text-slate-500">Cargando órdenes…</div>
              ) : orders.length === 0 ? (
                <div className="py-8 text-sm text-slate-500">No hay órdenes para los filtros actuales.</div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                        selectedId === order.id
                          ? "border-emerald-300 bg-emerald-50/70"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-slate-900">
                              {order.document_number || `Orden #${order.id}`}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(order.status)}`}>
                              {order.status}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(order.payment_status)}`}>
                              pago {order.payment_status}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            {order.customer_name || "Cliente web"} · {getPrimaryContact(order)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {order.items.length} item{order.items.length === 1 ? "" : "s"} · {formatDateTime(order.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900">{formatMoney(order.total)}</p>
                          {order.sale_document_number ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">{order.sale_document_number}</p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Detalle operativo" subtitle="Pago, items, timeline y acciones disponibles.">
              {!selectedOrder ? (
                <div className="text-sm text-slate-500">Selecciona una orden para ver su detalle.</div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Documento web</p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedOrder.document_number}</h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {selectedOrder.customer_name || "Cliente web"} · {getPrimaryContact(selectedOrder)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Total</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(selectedOrder.total)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <InfoPill label="Estado" value={selectedOrder.status} />
                    <InfoPill label="Pago" value={selectedOrder.payment_status} />
                    <InfoPill label="Fulfillment" value={selectedOrder.fulfillment_status} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoStat label="Pagado aprobado" value={formatMoney(sumApprovedPayments(selectedOrder))} tone="success" />
                    <InfoStat label="Saldo pendiente" value={formatMoney(selectedRemaining)} tone="warning" />
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Acciones operativas</h3>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={!canManage || selectedRemaining <= 0 || busyAction !== null}
                        onClick={() => void handleApprovePayment(selectedOrder)}
                        className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busyAction === `pay-${selectedOrder.id}` ? "Registrando..." : "Aprobar pago"}
                      </button>
                      <button
                        type="button"
                        disabled={!canManage || selectedOrder.payment_status !== "approved" || busyAction !== null}
                        onClick={() => void handleConvert(selectedOrder)}
                        className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busyAction === `convert-${selectedOrder.id}` ? "Convirtiendo..." : "Convertir a venta"}
                      </button>
                      {OPERATIVE_STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!canManage || (option.value === "fulfilled" && selectedOrder.sale_id == null) || busyAction !== null}
                          onClick={() => void handleStatusUpdate(selectedOrder, option.value)}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h3 className="text-sm font-semibold text-slate-900">Items</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.product_name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              SKU {item.product_sku || "sin SKU"} · {item.quantity} x {formatMoney(item.unit_price)}
                            </p>
                          </div>
                          <div className="text-sm font-semibold text-slate-900">{formatMoney(item.line_total)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200">
                      <div className="border-b border-slate-200 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">Pagos de la orden</h3>
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        {selectedOrder.payments.length === 0 ? (
                          <p className="text-sm text-slate-500">Aún no hay pagos registrados.</p>
                        ) : (
                          selectedOrder.payments.map((payment) => <PaymentCard key={payment.id} payment={payment} />)
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200">
                      <div className="border-b border-slate-200 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">Timeline documental</h3>
                      </div>
                      <div className="space-y-3 px-4 py-4">
                        {selectedOrder.status_logs.length === 0 ? (
                          <p className="text-sm text-slate-500">Sin trazabilidad visible todavía.</p>
                        ) : (
                          selectedOrder.status_logs.map((log) => (
                            <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-slate-900">
                                  {log.from_status ? `${log.from_status} → ` : ""}{log.to_status}
                                </p>
                                <span className="text-xs text-slate-500">{formatDateTime(log.created_at)}</span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                Actor: {log.actor_type}{log.actor_user_id ? ` #${log.actor_user_id}` : ""}
                              </p>
                              <p className="mt-2 text-xs text-slate-700">{log.note || "Sin nota adicional"}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </section>
        ) : null}

        {activeTab === "payments" ? (
          <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
            <SectionCard title="Resumen de pagos" subtitle="Ledger aplanado de todo lo registrado sobre órdenes web.">
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Pagos registrados" value={String(paymentRows.length)} tone="default" />
                <MetricCard
                  label="Pagos aprobados"
                  value={formatMoney(paymentRows.filter((payment) => payment.status === "approved").reduce((sum, payment) => sum + payment.amount, 0))}
                  tone="success"
                />
              </div>
              <div className="mt-5 space-y-3">
                {paymentRows.slice(0, 8).map((payment) => (
                  <button
                    key={payment.paymentId}
                    type="button"
                    onClick={() => {
                      setSelectedId(payment.orderId);
                      setActiveTab("orders");
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{payment.orderDocument} · {payment.method}</p>
                      <p className="mt-1 text-xs text-slate-500">{payment.customerName} · {payment.provider}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(payment.amount)}</p>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{payment.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Ledger de pagos" subtitle="Útil para auditoría rápida del canal web.">
              {paymentRows.length === 0 ? (
                <div className="text-sm text-slate-500">Aún no hay pagos registrados.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Fecha</th>
                        <th className="px-3 py-3">Documento</th>
                        <th className="px-3 py-3">Cliente</th>
                        <th className="px-3 py-3">Método</th>
                        <th className="px-3 py-3">Proveedor</th>
                        <th className="px-3 py-3">Estado</th>
                        <th className="px-3 py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((payment) => (
                        <tr key={payment.paymentId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-3 text-slate-600">{formatDateTime(payment.createdAt)}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(payment.orderId);
                                setActiveTab("orders");
                              }}
                              className="font-medium text-slate-900 hover:text-emerald-700"
                            >
                              {payment.orderDocument}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {payment.customerName}
                            <div className="text-xs text-slate-500">{payment.customerEmail}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{payment.method}</td>
                          <td className="px-3 py-3 text-slate-700">{payment.provider}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{payment.status}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </section>
        ) : null}

        {activeTab === "customers" ? (
          <section className="grid gap-6 xl:grid-cols-[0.88fr,1.12fr]">
            <SectionCard title="Clientes del canal web" subtitle="Acumulado comercial derivado de órdenes `OW`.">
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard label="Clientes visibles" value={String(customerRows.length)} />
                <MetricCard label="Clientes con venta convertida" value={String(customerRows.filter((row) => row.converted > 0).length)} tone="success" />
              </div>
              <div className="mt-5 space-y-3">
                {customerRows.slice(0, 8).map((customer) => (
                  <div key={customer.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{customer.email} · {customer.phone}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(customer.total)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{customer.orders} órdenes · {customer.converted} convertidas</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Tabla comercial" subtitle="Detecta clientes repetitivos y maduración del canal web.">
              {customerRows.length === 0 ? (
                <div className="text-sm text-slate-500">Aún no hay suficientes órdenes para construir una vista comercial de clientes.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Cliente</th>
                        <th className="px-3 py-3">Órdenes</th>
                        <th className="px-3 py-3">Aprobado</th>
                        <th className="px-3 py-3">Convertidas</th>
                        <th className="px-3 py-3">Última orden</th>
                        <th className="px-3 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerRows.map((customer) => (
                        <tr key={customer.key} className="border-b border-slate-100">
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-900">{customer.name}</p>
                            <p className="text-xs text-slate-500">{customer.email} · {customer.phone}</p>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{customer.orders}</td>
                          <td className="px-3 py-3 text-slate-700">{formatMoney(customer.approved)}</td>
                          <td className="px-3 py-3 text-slate-700">{customer.converted}</td>
                          <td className="px-3 py-3 text-slate-700">{formatDateTime(customer.lastOrderAt)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatMoney(customer.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-900">{label}</span>
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative h-7 w-12 rounded-full transition ${
            checked ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
              checked ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function InfoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone === "success" ? "text-emerald-700" : "text-amber-700"}`}>{value}</p>
    </div>
  );
}

function SummaryBox({
  title,
  value,
  caption,
  tone,
}: {
  title: string;
  value: number;
  caption: string;
  tone: "warning" | "info" | "success";
}) {
  const classes =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "info"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <div className={`rounded-3xl border p-4 ${classes}`}>
      <p className="text-[11px] uppercase tracking-[0.18em]">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs opacity-80">{caption}</p>
    </div>
  );
}

function SummaryMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function QueueList({
  title,
  orders,
  emptyMessage,
  onSelect,
  onJump,
  highlight,
}: {
  title: string;
  orders: ComercioWebOrder[];
  emptyMessage: string;
  onSelect: (orderId: number) => void;
  onJump: () => void;
  highlight: "warning" | "info" | "success";
}) {
  const colorClass =
    highlight === "warning"
      ? "border-amber-200 bg-amber-50/60"
      : highlight === "info"
        ? "border-sky-200 bg-sky-50/60"
        : "border-emerald-200 bg-emerald-50/60";
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-3 space-y-3">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">{emptyMessage}</div>
        ) : (
          orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => {
                onSelect(order.id);
                onJump();
              }}
              className={`flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left transition hover:border-slate-300 ${colorClass}`}
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{order.document_number || `Orden #${order.id}`}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {order.customer_name || "Cliente web"} · {getPrimaryContact(order)}
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-900">{formatMoney(order.total)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function DistributionRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-medium text-slate-900">{count} · {percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(percentage, count > 0 ? 8 : 0)}%` }} />
      </div>
    </div>
  );
}

function PaymentCard({ payment }: { payment: ComercioWebOrderPayment }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{payment.method || "Sin método"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {payment.provider || "Sin proveedor"}
            {payment.provider_reference ? ` · ${payment.provider_reference}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{formatMoney(payment.amount)}</p>
          <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass(payment.status)}`}>{payment.status}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{formatDateTime(payment.created_at)}</p>
    </div>
  );
}
