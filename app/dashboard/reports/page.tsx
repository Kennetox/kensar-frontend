"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import { fetchPosSettings, PosSettingsPayload } from "@/lib/api/settings";
import { usePaymentMethodLabelResolver } from "@/app/hooks/usePaymentMethodLabelResolver";

type QuickRange = "today" | "yesterday" | "week" | "month" | "year";

type ReportPreset = {
  id: string;
  title: string;
  description: string;
  scope: string;
  highlights: string[];
};

type ReportSaleItem = {
  product_name?: string;
  name?: string;
  product_sku?: string | null;
  product_group?: string | null;
  product_category?: string | null;
  quantity: number;
  unit_price?: number;
  line_discount_value?: number;
};

type ReportSale = {
  id: number;
  sale_number?: number;
  document_number?: string;
  created_at: string;
  total?: number;
  paid_amount?: number;
  payment_method?: string;
  payments?: Array<{ method?: string | null; amount?: number | null }>;
  pos_name?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  items?: ReportSaleItem[];
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
};

type ReportSummaryItem = {
  label: string;
  value: string;
};

type ReportTable = {
  columns: string[];
  rows: Array<Array<string>>;
  emptyMessage?: string;
};

type ReportResult = {
  summary: ReportSummaryItem[];
  table?: ReportTable;
  note?: string;
  surchargeTotal?: number;
};

type CompanyInfo = {
  name: string;
  address: string;
  email: string;
  phone: string;
  logoUrl?: string | null;
};

type FilterMeta = {
  fromDate: string;
  toDate: string;
  posFilter: string;
  methodFilter: string;
  sellerFilter: string;
};

type OpenReportTab = {
  id: string;
  presetId: string;
  filterMeta: FilterMeta;
  createdAt: string;
};

const isValidFilterMeta = (value: unknown): value is FilterMeta => {
  if (!value || typeof value !== "object") return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.fromDate === "string" &&
    typeof meta.toDate === "string" &&
    typeof meta.posFilter === "string" &&
    typeof meta.methodFilter === "string" &&
    typeof meta.sellerFilter === "string"
  );
};

const isValidOpenReportTab = (value: unknown): value is OpenReportTab => {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<OpenReportTab>;
  return (
    typeof tab.id === "string" &&
    typeof tab.presetId === "string" &&
    typeof tab.createdAt === "string" &&
    tab.filterMeta !== undefined &&
    isValidFilterMeta(tab.filterMeta)
  );
};

const REPORT_LIMIT = 500;
const TABLE_ROWS_PER_PAGE = 12;
const PAGE_WIDTH_MM = 205;
const PAGE_HEIGHT_MM = 260;
const MM_TO_PX = 96 / 25.4;

const getDefaultDates = () => {
  const now = new Date();
  return {
    fromDate: new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    toDate: now.toISOString().slice(0, 10),
  };
};
const FAVORITES_STORAGE_KEY = "kensar_report_favorites";
const HOURLY_CHART_BAR_MAX_HEIGHT = 260; // px for chart bars height
const LINE_CHART_WIDTH = 780;
const LINE_CHART_HEIGHT = 320;
const LINE_CHART_PADDING = {
  top: 24,
  right: 20,
  bottom: 80,
  left: 60,
};
const LINE_CHART_TICKS = 5;
const OPEN_REPORTS_STORAGE_KEY = "kensar_report_open_tabs";
const ACTIVE_REPORT_TAB_STORAGE_KEY = "kensar_report_active_tab";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type PaymentLabelResolver = (method: string) => string;


const getReportDocumentTitle = (preset: ReportPreset, meta: FilterMeta) =>
  `${preset.title} ${meta.fromDate} – ${meta.toDate}`;

type ColumnPresentation = {
  align: "left" | "right" | "center";
  noWrap: boolean;
  isDateValue: boolean;
  clampLines?: number;
  maxWidth?: number;
  width?: number;
};

const getColumnPresentation = (column: string): ColumnPresentation => {
  const normalized = column.toLowerCase().trim();
  const presentation: ColumnPresentation = {
    align: "left",
    noWrap: false,
    isDateValue: false,
  };

  if (
    normalized.includes("código") ||
    normalized.includes("codigo") ||
    normalized.includes("sku")
  ) {
    presentation.align = "center";
    presentation.noWrap = true;
  }

  if (normalized.includes("producto")) {
    presentation.clampLines = 1;
    presentation.maxWidth = 260;
    presentation.width = 260;
  }

  if (
    normalized.includes("precio unitario") ||
    normalized.includes("cantidad") ||
    normalized.includes("total") ||
    normalized.includes("valor") ||
    normalized.includes("monto")
  ) {
    presentation.align = "right";
  }

  if (normalized.startsWith("fecha")) {
    presentation.noWrap = true;
    presentation.isDateValue = true;
  }

  if (normalized.includes("ticket")) {
    presentation.noWrap = true;
  }

  return presentation;
};


const FALLBACK_COMPANY: CompanyInfo = {
  name: "Kensar Electronic",
  address: "Cra 24 #30-75 Palmira",
  email: "kensarelec@gmail.com",
  phone: "3185657508",
  logoUrl: "",
};

const formatMoney = (value: number | undefined | null) => {
  if (value == null || Number.isNaN(value)) return "$0";
  return `$${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const normalizeText = (value: string | null | undefined) =>
  value?.toLowerCase().trim() ?? "";

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items.length ? items : []];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  if (!chunks.length) chunks.push([]);
  return chunks;
};

const buildRowChunks = (
  presetId: string,
  rows: string[][],
  defaultSize: number
): string[][][] => {
  if (!rows.length) {
    return chunkArray(rows, defaultSize);
  }
  if (presetId === "products-sold") {
    const firstPageSize = 17;
    const remainingSize = 19;
    const lastPageMax = 17;
    const chunks: string[][][] = [];
    let startIndex = 0;
    if (rows.length) {
      const firstChunk = rows.slice(0, firstPageSize);
      if (firstChunk.length) {
        chunks.push(firstChunk);
      }
      startIndex = firstChunk.length;
    }
    while (startIndex < rows.length) {
      const remainingCount = rows.length - startIndex;
      const size =
        remainingCount <= lastPageMax ? lastPageMax : remainingSize;
      chunks.push(rows.slice(startIndex, startIndex + size));
      startIndex += size;
    }
    return chunks.length ? chunks : ([[]] as string[][][]);
  }
  return chunkArray(rows, defaultSize);
};

type HourlyChartPoint = {
  label: string;
  total: number;
  tickets: number;
  percent: string;
};

type LineChartPoint = {
  label: string;
  value: number;
};

type ReportChartConfig =
  | {
      type: "hourly-bars";
      title: string;
      description: string;
      bars: HourlyChartPoint[];
      maxValue: number;
    }
  | {
      type: "month-line";
      title: string;
      description: string;
      points: LineChartPoint[];
      maxValue: number;
    }
  | {
      type: "payment-bars";
      title: string;
      description: string;
      items: PaymentBarPoint[];
      maxValue: number;
    };

const parseInteger = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d-]/g, "");
  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseMoney = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value
    .replace(/[^\d,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildHourlyChartData = (rows: string[][]): HourlyChartPoint[] =>
  rows
    .map((row) => ({
      label: row[0] ?? "",
      tickets: parseInteger(row[1]),
      total: parseMoney(row[2]),
      percent: row[3] ?? "",
    }))
    .filter((entry) => entry.label);

const formatChartHourLabel = (label: string) => {
  const [first] = label.split(/–|-/);
  return first ? first.trim() : label;
};

const buildMonthDailyChartData = (rows: string[][]): LineChartPoint[] =>
  rows
    .map((row) => ({
      label: row[0] ?? "",
      value: parseMoney(row[1]),
    }))
    .filter((entry) => entry.label);

type PaymentBarPoint = {
  label: string;
  total: number;
  percent?: string;
};

const buildPaymentMethodChartData = (rows: string[][]): PaymentBarPoint[] =>
  rows
    .map((row) => ({
      label: row[0] ?? "",
      total: parseMoney(row[1]),
      percent: row[3] ?? undefined,
    }))
    .filter((entry) => entry.label && entry.total > 0);

const getChartConfig = (
  presetId: string,
  tableRows: string[][]
): ReportChartConfig | null => {
  switch (presetId) {
    case "hourly-sales": {
      const bars = buildHourlyChartData(tableRows);
      if (!bars.length) return null;
      const maxValue = bars.reduce(
        (max, entry) => Math.max(max, entry.total),
        0
      );
      return {
        type: "hourly-bars",
        bars,
        maxValue,
        title: "Comportamiento por hora",
        description:
          "Barras verticales que representan las ventas por cada hora incluida en el reporte.",
      };
    }
    case "month-daily": {
      const points = buildMonthDailyChartData(tableRows);
      if (!points.length) return null;
      const maxValue = points.reduce(
        (max, entry) => Math.max(max, entry.value),
        0
      );
      return {
        type: "month-line",
        points,
        maxValue,
        title: "Comportamiento por día",
        description:
          "Tendencia diaria del mes para identificar picos y caídas de venta.",
      };
    }
    case "payment-methods": {
      const items = buildPaymentMethodChartData(tableRows);
      if (!items.length) return null;
      const maxValue = items.reduce(
        (max, entry) => Math.max(max, entry.total),
        0
      );
      return {
        type: "payment-bars",
        items,
        maxValue,
        title: "Distribución por método",
        description:
          "Comparativa horizontal del aporte de cada método de pago.",
      };
    }
    default:
      return null;
  }
};

const REPORT_PRESETS: ReportPreset[] = [
  {
    id: "daily-sales",
    title: "Ventas del día",
    description:
      "Valor total, número de tickets, promedio y comparativo contra el día anterior.",
    scope: "Ventas",
    highlights: ["Tickets por POS", "Top métodos de pago", "Descuentos"],
  },
  {
    id: "month-daily",
    title: "Ventas del mes (por día)",
    description:
      "Detalle diario del mes actual con acumulado, devoluciones y ticket promedio.",
    scope: "Ventas",
    highlights: ["Tendencia diaria", "Alertas de caída", "Ticket promedio"],
  },
  {
    id: "category-sales",
    title: "Ventas por categoría",
    description:
      "Distribución por familias de productos y aporte porcentual a la venta total.",
    scope: "Catálogos",
    highlights: ["Top categorías", "Portafolio rezagado", "Margen estimado"],
  },
  {
    id: "profit-margin",
    title: "Margen de beneficio",
    description:
      "Resumen de costos vs. ventas para estimar el margen bruto por línea.",
    scope: "Finanzas",
    highlights: ["Margen (%)", "Top SKU rentables", "Alertas de margen bajo"],
  },
  {
    id: "stock-preview",
    title: "Reporte de stock",
    description:
      "Próximamente: niveles de inventario, rotación y alertas de reposición.",
    scope: "Inventarios",
    highlights: ["Stock crítico", "Días de cobertura", "Rotación mensual"],
  },
  {
    id: "pos-performance",
    title: "Ventas por POS / sucursal",
    description:
      "Comparativo lado a lado para cada terminal con ventas, tickets y ticket promedio.",
    scope: "Ventas",
    highlights: ["Ranking POS", "Tickets por POS", "Ticket promedio"],
  },
  {
    id: "seller-performance",
    title: "Rendimiento por vendedor",
    description:
      "Ventas, tickets, ticket promedio y cumplimiento de meta para cada colaborador.",
    scope: "Ventas",
    highlights: ["Meta vs. real", "Ticket promedio", "Comisión estimada"],
  },
  {
    id: "payment-methods",
    title: "Ventas por método de pago",
    description:
      "Distribución de ventas y tickets según cada método de pago utilizado.",
    scope: "Ventas",
    highlights: ["Participación por método", "Tickets por método", "Venta neta"],
  },
  {
    id: "hourly-sales",
    title: "Ventas por hora",
    description:
      "Detalle de tickets y valor vendido para cada hora del día y detectar picos de actividad.",
    scope: "Ventas",
    highlights: ["Hora pico", "Tickets por hora", "Participación"],
  },
  {
    id: "client-segmentation",
    title: "Ventas por cliente / segmento",
    description:
      "Identifica los clientes con mayor valor, frecuencia y crecimiento mensual.",
    scope: "Clientes",
    highlights: ["Top clientes", "Frecuencia", "Valor acumulado"],
  },
  {
    id: "loyalty-repeat",
    title: "Recurrencia y nuevos clientes",
    description:
      "Seguimiento de clientes nuevos vs. recurrentes, CLV y tasa de retención.",
    scope: "Clientes",
    highlights: ["Nuevos vs. recurrentes", "CLV estimado", "Retención"],
  },
  {
    id: "discounts-report",
    title: "Descuentos y promociones",
    description:
      "Cuánta venta llega por promociones, quién aplica los descuentos y su impacto.",
    scope: "Finanzas",
    highlights: ["Venta con promo", "Top cajeros", "Margen afectado"],
  },
  {
    id: "supplier-brands",
    title: "Ventas por proveedor / marca",
    description:
      "Distribución de ventas por proveedor para apoyar negociaciones y compras.",
    scope: "Catálogos",
    highlights: ["Ranking proveedores", "Participación", "Crecimiento"],
  },
  {
    id: "returns-breakdown",
    title: "Devoluciones por categoría / SKU",
    description:
      "Motivos y frecuencia de devoluciones para identificar productos problemáticos.",
    scope: "Ventas",
    highlights: ["Tasa devolución", "Motivos", "Alertas calidad"],
  },
  {
    id: "combos-services",
    title: "Tendencia de combos o servicios",
    description:
      "Evaluación de combos o servicios: margen, éxito de upselling y cross selling.",
    scope: "Ventas",
    highlights: ["Margen combos", "Upselling", "SKUs asociados"],
  },
  {
    id: "payments-reconciliation",
    title: "Conciliación métodos de pago",
    description:
      "Comparativo del POS contra plataformas externas para revisar inconsistencias.",
    scope: "Finanzas",
    highlights: ["Cuadre diario", "Comisiones", "Alertas de diferencia"],
  },
  {
    id: "cash-flow",
    title: "Flujo de caja",
    description:
      "Entradas vs. salidas por día/semana para rastrear diferencias y reposiciones.",
    scope: "Finanzas",
    highlights: ["Entradas", "Salidas", "Diferencias detectadas"],
  },
  {
    id: "credit-balance",
    title: "Anticipos y créditos pendientes",
    description:
      "Listado de clientes con saldo por cerrar (pagos parciales, apartados, separaciones).",
    scope: "Finanzas",
    highlights: ["Saldo cliente", "Último pago", "Alertas de vencimiento"],
  },
  {
    id: "pos-user-conciliation",
    title: "Conciliación por cajero",
    description:
      "Detalle de ventas, devoluciones y efectivo entregado por cada turno/cajero.",
    scope: "Finanzas",
    highlights: ["Efectivo esperado", "Devoluciones", "Diferencias"],
  },
  {
    id: "products-top",
    title: "Top productos vendidos",
    description:
      "Ranking de los artículos con mayor aporte en unidades y valor durante el periodo filtrado.",
    scope: "Productos",
    highlights: ["Ranking SKU", "Participación", "Última venta"],
  },
  {
    id: "products-sold",
    title: "Productos vendidos (detalle)",
    description:
      "Detalle de cada artículo vendido con fecha, ticket, código y precio aplicado.",
    scope: "Productos",
    highlights: ["Ticket / POS", "Precio aplicado", "Cantidad"],
  },
  {
    id: "products-returns",
    title: "Devoluciones por producto",
    description:
      "Seguimiento de devoluciones, garantías y productos con incidencias recurrentes.",
    scope: "Productos",
    highlights: ["Motivos", "SKU afectado", "Alertas de calidad"],
  },
  {
    id: "surcharge-summary",
    title: "Incrementos por periodo",
    description:
      "Resumen de los recargos aplicados en ventas Addi/Sistecrédito o manuales.",
    scope: "Ventas",
    highlights: ["Ticket", "Método", "Valor agregado"],
  },
  {
    id: "products-margin",
    title: "Margen y rotación por producto",
    description:
      "Próximamente: margen estimado, rotación y roturas de stock por SKU.",
    scope: "Productos",
    highlights: ["Margen bruto", "Rotación", "Alertas de stock"],
  },
];

function filterSalesByMeta(
  salesData: ReportSale[],
  meta: FilterMeta
): ReportSale[] {
  if (!salesData.length) return [];
  const from = new Date(meta.fromDate);
  const to = new Date(meta.toDate);
  to.setHours(23, 59, 59, 999);

  return salesData.filter((sale) => {
    const saleDate = new Date(sale.created_at);
    if (Number.isNaN(saleDate.getTime())) return false;
    if (saleDate < from || saleDate > to) return false;

    if (
      meta.posFilter !== "todos" &&
      normalizeText(sale.pos_name) !== normalizeText(meta.posFilter)
    ) {
      return false;
    }

    if (meta.methodFilter !== "todos") {
      const methodSlug = normalizeText(meta.methodFilter);
      const saleMethod = normalizeText(sale.payment_method);
      const multiMatch =
        (sale.payments ?? []).some(
          (payment) => normalizeText(payment.method) === methodSlug
        ) || false;
      if (saleMethod !== methodSlug && !multiMatch) {
        return false;
      }
    }

    if (
      meta.sellerFilter &&
      !normalizeText(sale.vendor_name).includes(
        meta.sellerFilter.toLowerCase().trim()
      )
    ) {
      return false;
    }

    return true;
  });
}

type DocumentHtmlOptions = {
  pageIndex?: number | null;
};

function buildDocumentHtml(
  preset: ReportPreset,
  result: ReportResult,
  info: CompanyInfo,
  meta: FilterMeta,
  resolvePaymentLabel?: (method: string) => string,
  options?: DocumentHtmlOptions
): string {
  const tableColumns = result.table?.columns ?? [];
  const tableRows = result.table?.rows ?? [];
  const rowsPerPage = (() => {
    if (preset.id === "hourly-sales") return 16;
    if (preset.id === "month-daily") return 18;
    return TABLE_ROWS_PER_PAGE;
  })();
  const chartConfig = getChartConfig(preset.id, tableRows);
  const columnLayouts = tableColumns.map((column) =>
    getColumnPresentation(column)
  );
  const documentTitle = getReportDocumentTitle(preset, meta);
  const emptyMessage =
    result.table?.emptyMessage ??
    "No hay información disponible con los filtros aplicados.";
  const rowChunks = buildRowChunks(preset.id, tableRows, rowsPerPage);
  const tablePagesCount = rowChunks.length;
  const hasChartPage = !!chartConfig;
  const rawTotalPages = tablePagesCount + (hasChartPage ? 1 : 0);
  const totalPages = Math.max(rawTotalPages, 1);
  const summaryCards = result.summary
    .map(
      (item) =>
        `<div class="card"><p class="label">${item.label}</p><p class="value">${item.value}</p></div>`
    )
    .join("");
  const surchargeInfoHtml =
    result.surchargeTotal && result.surchargeTotal > 0
      ? `<div class="surcharge-line">Incremento cobrado en el periodo:<strong>${formatMoney(
          result.surchargeTotal
        )}</strong></div>`
      : "";
  const noteHtml = result.note ? `<div class="note">${result.note}</div>` : "";
  const pageWidth = `${PAGE_WIDTH_MM}mm`;
  const pageHeight = `${PAGE_HEIGHT_MM}mm`;
  const targetPageIndex =
    typeof options?.pageIndex === "number" ? options.pageIndex : null;
  const tablePagesHtml = rowChunks
    .map((rowsChunk, pageIdx) => {
      if (targetPageIndex !== null && targetPageIndex !== pageIdx) {
        return "";
      }
      const tableHtml =
        tableColumns.length > 0
          ? `<table>
                <thead>
                  <tr>${tableColumns
                    .map((column, columnIdx) => {
                      const layout = columnLayouts[columnIdx];
                      const styleAttr = layout.maxWidth
                        ? ` style="${layout.width ? `width:${layout.width}px;` : ""}max-width:${layout.maxWidth}px"`
                        : "";
                      return `<th class="${cx(
                        `align-${layout.align}`,
                        layout.noWrap && "nowrap",
                        layout.align === "right" && "numeric"
                      )}"${styleAttr}>${column}</th>`;
                    })
                    .join("")}</tr>
                </thead>
                <tbody>
                  ${
                    rowsChunk.length > 0
                      ? rowsChunk
                          .map(
                            (row) =>
                              `<tr>${row
                                .map((cell, cellIdx) => {
                                  const layout = columnLayouts[cellIdx];
                                  const content = layout.clampLines
                                    ? `<span class="cell-text clamp-${layout.clampLines}">${cell}</span>`
                                    : cell;
                                  const styleAttr = layout.maxWidth
                                    ? ` style="${layout.width ? `width:${layout.width}px;` : ""}max-width:${layout.maxWidth}px"`
                                    : "";
                                  return `<td class="${cx(
                                    `align-${layout.align}`,
                                    layout.noWrap && "nowrap",
                                    layout.align === "right" && "numeric",
                                    layout.isDateValue && "date-cell"
                                  )}"${styleAttr}>${content}</td>`;
                                })
                                .join("")}</tr>`
                          )
                          .join("")
                      : `<tr><td colspan="${tableColumns.length}" class="empty">${emptyMessage}</td></tr>`
                  }
                </tbody>
              </table>`
          : `<div class="empty">${emptyMessage}</div>`;
      const showSummary = pageIdx === 0;
      const showNote = pageIdx === tablePagesCount - 1 && !!noteHtml;
      return `<div class="report-wrapper">
        <div class="page-body">
          <header>
            <div class="left">
              ${
                info.logoUrl
                  ? `<img src="${info.logoUrl}" alt="Logo" class="logo" />`
                  : ""
              }
              <div>
                <div class="title">${preset.title}</div>
                <div>${info.name}</div>
                <div>${info.address}</div>
                <div>${info.email}${
        info.phone ? " · " + info.phone : ""
      }</div>
              </div>
            </div>
            <div class="right">
              <span>Generado:</span>
              <div>${new Date().toLocaleString("es-CO")}</div>
            </div>
          </header>
          <div class="meta">
            <div><span>Periodo:</span> ${meta.fromDate} – ${meta.toDate}</div>
            <div><span>POS:</span> ${
              meta.posFilter === "todos" ? "Todos" : meta.posFilter
            }</div>
            <div><span>Método:</span> ${
              meta.methodFilter === "todos"
                ? "Todos"
                : resolvePaymentLabel
                ? resolvePaymentLabel(meta.methodFilter)
                : meta.methodFilter
            }</div>
            <div><span>Vendedor:</span> ${meta.sellerFilter || "Todos"}</div>
          </div>
          ${
            showSummary
              ? `<div class="summary">
            ${summaryCards}
          </div>${surchargeInfoHtml ? surchargeInfoHtml : ""}`
              : ""
          }
          <div class="table-block">
            ${tableHtml}
          </div>
          ${showNote ? noteHtml : ""}
          ${
            showNote
              ? `<div class="components">
            <strong>Componentes:</strong> ${
              preset.highlights.length ? preset.highlights.join(", ") : "—"
            }
          </div>`
              : ""
          }
        </div>
        <div class="footer">
          <span>${info.name}</span>
          <span>Página ${pageIdx + 1} / ${totalPages}</span>
        </div>
      </div>`;
    })
    .filter(Boolean)
    .join("");
  let chartContent = "";
  if (chartConfig?.type === "hourly-bars") {
    const { bars, maxValue } = chartConfig;
    chartContent = `<div class="chart-area">
      ${bars
        .map((entry) => {
          const heightPx =
            maxValue > 0
              ? (entry.total / maxValue) * HOURLY_CHART_BAR_MAX_HEIGHT
              : 0;
          const adjustedHeight = Math.max(
            heightPx,
            entry.total > 0 ? HOURLY_CHART_BAR_MAX_HEIGHT * 0.12 : 0
          );
          const shortLabel = formatChartHourLabel(entry.label);
          const ticketLabel = entry.tickets === 1 ? "ticket" : "tickets";
          return `<div class="chart-bar">
            <div class="chart-value">${formatMoney(entry.total)}</div>
            <div class="bar" style="height:${adjustedHeight}px;"></div>
            <div class="chart-label">${shortLabel}</div>
            <div class="chart-subtext">${entry.tickets} ${ticketLabel}</div>
          </div>`;
        })
        .join("")}
    </div>`;
  } else if (chartConfig?.type === "month-line") {
    const { points, maxValue } = chartConfig;
    const width = LINE_CHART_WIDTH;
    const height = LINE_CHART_HEIGHT;
    const { top, right, bottom, left } = LINE_CHART_PADDING;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;
    const safeMax = Math.max(maxValue, 1);
    const polylinePoints = points
      .map((point, idx) => {
        const ratio = safeMax > 0 ? point.value / safeMax : 0;
        const x =
          left + (points.length > 1 ? idx * xStep : innerWidth / 2);
        const y = top + innerHeight - ratio * innerHeight;
        return `${x},${y}`;
      })
      .join(" ");
    const tickCount = Math.max(LINE_CHART_TICKS, 2);
    const tickLines = Array.from({ length: tickCount })
      .map((_, idx) => {
        const value =
          idx === tickCount - 1
            ? safeMax
            : (safeMax / (tickCount - 1)) * idx;
        const ratio = safeMax > 0 ? value / safeMax : 0;
        const y = top + innerHeight - ratio * innerHeight;
        return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="line-grid" />
        <text x="${left - 10}" y="${y + 4}" class="line-y-label">${formatMoney(
          value
        )}</text>`;
      })
      .join("");
    const pointElements = points
      .map((point, idx) => {
        const ratio = safeMax > 0 ? point.value / safeMax : 0;
        const x =
          left + (points.length > 1 ? idx * xStep : innerWidth / 2);
        const y = top + innerHeight - ratio * innerHeight;
        const labelY = height - bottom + 30;
        return `<circle cx="${x}" cy="${y}" r="4" class="line-point" />
        <text x="${x}" y="${y - 8}" class="line-value">${formatMoney(
          point.value
        )}</text>
        <text x="${x}" y="${labelY}" transform="rotate(-40 ${x} ${labelY})" class="line-x-label">${point.label}</text>`;
      })
      .join("");
    chartContent = `<div class="line-chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="line-svg">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom + 10}" class="line-axis" />
        <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${
          height - bottom
        }" class="line-axis" />
        ${tickLines}
        <polyline points="${polylinePoints}" class="line-path" />
        ${pointElements}
      </svg>
    </div>`;
  } else if (chartConfig?.type === "payment-bars") {
    const { items, maxValue } = chartConfig;
    const safeMax = Math.max(maxValue, 1);
    chartContent = `<div class="payment-bars">
      ${items
        .map((item) => {
          const percent = safeMax > 0 ? (item.total / safeMax) * 100 : 0;
          return `<div class="payment-row">
            <div class="payment-label">${item.label}</div>
            <div class="payment-bar-track"><div class="payment-bar-fill" style="width:${percent}%"></div></div>
            <div class="payment-value">${formatMoney(item.total)}</div>
          </div>`;
        })
        .join("")}
    </div>`;
  }
  const chartUsesLandscape = !!chartConfig && chartConfig.type !== "payment-bars";
  const chartWrapperClasses = chartUsesLandscape
    ? "report-wrapper chart-wrapper landscape"
    : "report-wrapper chart-wrapper";
  const chartPageIndex = tablePagesCount;
  const shouldRenderChart =
    !!chartConfig &&
    (targetPageIndex === null || targetPageIndex === chartPageIndex);
  const chartPageHtml =
    shouldRenderChart && chartConfig
      ? `<div class="${chartWrapperClasses}">
        <div class="chart-body">
          <header>
            <div class="left">
              ${
                info.logoUrl
                  ? `<img src="${info.logoUrl}" alt="Logo" class="logo" />`
                  : ""
              }
              <div>
                <div class="title">${preset.title}</div>
                <div>${info.name}</div>
                <div>${info.address}</div>
                <div>${info.email}${
        info.phone ? " · " + info.phone : ""
      }</div>
              </div>
            </div>
            <div class="right">
              <span>Generado:</span>
              <div>${new Date().toLocaleString("es-CO")}</div>
            </div>
          </header>
          <div class="chart-meta">
            <div><span>Periodo:</span> ${meta.fromDate} – ${meta.toDate}</div>
            <div><span>POS:</span> ${
              meta.posFilter === "todos" ? "Todos" : meta.posFilter
            }</div>
            <div><span>Método:</span> ${
              meta.methodFilter === "todos"
                ? "Todos"
                : resolvePaymentLabel
                ? resolvePaymentLabel(meta.methodFilter)
                : meta.methodFilter
            }</div>
            <div><span>Vendedor:</span> ${meta.sellerFilter || "Todos"}</div>
          </div>
          <div class="chart-title">${chartConfig.title}</div>
          <p class="chart-description">
            ${chartConfig.description}
          </p>
          ${chartContent}
        </div>
        <div class="footer">
          <span>${info.name}</span>
          <span>Página ${totalPages} / ${totalPages}</span>
        </div>
      </div>`
      : "";
  return `<!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${documentTitle}</title>
        <style>
          @page { size: ${pageWidth} ${pageHeight}; margin: 0; }
          @page chart-landscape { size: ${pageHeight} ${pageWidth}; margin: 0; }
          * { box-sizing: border-box; font-family: "Inter", Arial, sans-serif; }
          body { background: #f4f6f9; color: #0f172a; margin: 0; padding: 24px 0; }
          @media print { body { padding: 0; background: #fff; } }
          .report-wrapper { width: ${pageWidth}; min-height: ${pageHeight}; margin: 0 auto 12mm; background: #fff; border: 1px solid #d3d7df; page-break-after: always; display:flex;flex-direction:column; }
          .report-wrapper:last-child { page-break-after: auto; }
          .chart-wrapper { width: ${pageWidth}; min-height: ${pageHeight}; }
          .chart-wrapper.landscape { width: ${pageHeight}; min-height: ${pageWidth}; page: chart-landscape; }
          .chart-body { flex:1; display:flex; flex-direction:column; padding: 20px 24px 24px; }
          .page-body { flex:1; display:flex; flex-direction:column; }
          header { padding: 20px 24px 18px; border-bottom: 1px solid #e3e6ef; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; align-items: center; margin-bottom: 6px; }
          header .left { display: flex; gap: 12px; align-items: center; }
          header .title { font-size: 18px; font-weight: 600; }
          .logo { height: 48px; width: auto; object-fit: contain; }
          header .right { text-align:right;font-size:11px;color:#475569; }
          .meta { padding: 14px 24px; background: #f8fafc; border-bottom: 1px solid #e3e6ef; display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 12px; font-size: 11px; }
          .meta span { font-weight: 600; color: #0f172a; }
          .summary { padding: 12px 24px; display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 10px; }
          .card { border: 1px solid #e3e6ef; border-radius: 12px; padding: 10px 12px; background: #fff; break-inside: avoid; min-height: 78px; display:flex; flex-direction:column; justify-content:center; }
          .card .label { font-size: 10px; text-transform: uppercase; color: #475569; margin-bottom: 4px; }
          .card .value { font-size: 18px; font-weight: 600; }
          .table-block { flex:1; padding: 0 24px 16px; display:flex; flex-direction:column; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d7dbe5; padding: 8px 10px; vertical-align: top; }
          th { background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #475569; }
          tr:nth-child(even) { background: #fdfdfd; }
          tr { break-inside: avoid; }
          .note { margin: 16px 24px 8px; font-size: 11px; color: #475569; }
          .footer { border-top: 1px solid #e3e6ef; padding: 10px 24px; font-size: 10px; display: flex; justify-content: space-between; color: #64748b; margin-top:auto; }
          .components { font-size: 11px; margin: 4px 24px 12px; color: #475569; }
          .empty { padding: 16px; text-align: center; color: #94a3b8; font-size: 12px; }
          .align-left { text-align: left; }
          .align-right { text-align: right; }
          .align-center { text-align: center; }
          .nowrap { white-space: nowrap; }
          .numeric { font-variant-numeric: tabular-nums; }
          .date-cell { font-size: 11px; }
          .chart-meta { padding: 12px 0 6px; display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 12px; font-size: 11px; border-bottom: 1px solid #e3e6ef; margin-bottom: 10px; }
          .chart-meta span { font-weight: 600; color: #0f172a; }
          .chart-title { font-size: 16px; font-weight: 600; margin: 12px 0 4px; }
          .chart-description { font-size: 11px; color: #475569; margin-bottom: 12px; }
          .chart-area { flex:1; border:1px solid #d7dbe5; border-radius: 18px; background:#f8fafc; padding: 20px 16px 12px; display:flex; align-items:flex-end; gap: 8px; }
          .chart-bar { flex:1; min-width: 28px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; text-align:center; font-size: 10px; color:#475569; }
          .chart-bar .bar { width: 26px; background: linear-gradient(180deg,#34d399,#059669); border-radius: 10px 10px 0 0; }
          .chart-value { font-size: 11px; font-weight: 600; margin-bottom: 4px; color:#0f172a; display:inline-block; transform:rotate(-32deg); transform-origin:left bottom; }
          .chart-label { font-size: 10px; font-weight: 600; margin-top: 6px; color:#0f172a; }
          .chart-subtext { font-size: 9px; color:#94a3b8; margin-top: 1px; }
          .line-chart { flex:1; border:1px solid #d7dbe5; border-radius: 18px; background:#fff; padding: 12px 8px; }
          .line-svg { width: 100%; height: 100%; }
          .line-grid { stroke: #e2e8f0; stroke-width: 1; }
          .line-axis { stroke: #94a3b8; stroke-width: 1.2; }
          .line-path { fill: none; stroke: #10b981; stroke-width: 2.5; }
          .line-point { fill: #0ea5e9; stroke: #fff; stroke-width: 1.5; }
          .line-value { font-size: 10px; fill: #0f172a; text-anchor: middle; }
          .line-x-label { font-size: 9px; fill: #475569; text-anchor: end; }
          .line-y-label { font-size: 9px; fill: #475569; text-anchor: end; }
          .payment-bars { display:flex; flex-direction:column; gap:10px; padding:12px 0; }
          .payment-row { display:grid; grid-template-columns: 130px 1fr 90px; gap:12px; align-items:center; font-size:11px; color:#0f172a; }
          .payment-label { font-weight:600; color:#0f172a; }
          .payment-bar-track { background:#e2e8f0; border-radius:999px; height:14px; overflow:hidden; }
          .payment-bar-fill { background:linear-gradient(90deg,#34d399,#059669); height:100%; border-radius:999px; }
          .payment-value { font-weight:600; text-align:right; font-size:12px; }
          .surcharge-line { margin: 4px 24px; font-size: 11px; color: #0f172a; }
          .surcharge-line strong { font-size: 12px; margin-left: 4px; }
          .cell-text { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3; }
          .cell-text.clamp-1 { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; -webkit-line-clamp: unset; min-height: auto; }
          .cell-text.clamp-2 { -webkit-line-clamp: 2; min-height: 2.6em; }
          .cell-text.clamp-3 { -webkit-line-clamp: 3; min-height: 3.9em; }
        </style>
      </head>
      <body>
        ${tablePagesHtml}${chartPageHtml}
      </body>
    </html>`;
}

function buildReportResult(
  reportId: string,
  sales: ReportSale[],
  labelResolver?: PaymentLabelResolver
): ReportResult | null {
  const resolvePaymentLabel =
    labelResolver ?? ((method: string) => method.toUpperCase());
  if (!sales.length) {
    return {
      summary: [
        { label: "Ventas netas", value: "$0" },
        { label: "Tickets", value: "0" },
        { label: "Ticket promedio", value: "$0" },
      ],
      table: {
        columns: [],
        rows: [],
        emptyMessage: "No hay datos con los filtros actuales.",
      },
      surchargeTotal: 0,
    };
  }

  const totalNet = sales.reduce((sum, sale) => sum + (sale.total ?? 0), 0);
  const totalSurcharge = sales.reduce(
    (sum, sale) => sum + Math.max(0, sale.surcharge_amount ?? 0),
    0
  );
  const ticketCount = sales.length;
  const avgTicket = ticketCount ? totalNet / ticketCount : 0;

  const groupBy = (
    keyFn: (sale: ReportSale) => string,
    valueReducer: (entry: {
      total: number;
      count: number;
      extra?: Record<string, number>;
    }) => void = () => {}
  ) => {
    const map = new Map<
      string,
      { total: number; count: number; extra: Record<string, number> }
    >();
    sales.forEach((sale) => {
      const key = keyFn(sale) || "Sin dato";
      if (!map.has(key)) {
        map.set(key, { total: 0, count: 0, extra: {} });
      }
      const entry = map.get(key)!;
      entry.total += sale.total ?? 0;
      entry.count += 1;
      valueReducer(entry);
    });
    return map;
  };

const dayFormatter = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
    });
};

const dateTimeFormatter = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  switch (reportId) {
    case "daily-sales": {
      const posMap = groupBy((sale) => sale.pos_name ?? "Sin POS");
      const rows = Array.from(posMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([pos, entry]) => [
          pos,
          formatMoney(entry.total),
          entry.count.toString(),
          formatMoney(entry.count ? entry.total / entry.count : 0),
        ]);
      return {
        summary: [
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Tickets", value: ticketCount.toString() },
          { label: "Ticket promedio", value: formatMoney(avgTicket) },
        ],
        table: {
          columns: ["POS", "Ventas", "Tickets", "Ticket promedio"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "month-daily": {
      const dayMap = new Map<string, { total: number; count: number }>();
      sales.forEach((sale) => {
        const key = sale.created_at.slice(0, 10);
        if (!dayMap.has(key)) {
          dayMap.set(key, { total: 0, count: 0 });
        }
        const entry = dayMap.get(key)!;
        entry.total += sale.total ?? 0;
        entry.count += 1;
      });
      const rows = Array.from(dayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, entry]) => [
          dayFormatter(date),
          formatMoney(entry.total),
          entry.count.toString(),
          formatMoney(entry.count ? entry.total / entry.count : 0),
        ]);
      return {
        summary: [
          { label: "Ventas del periodo", value: formatMoney(totalNet) },
          { label: "Tickets", value: ticketCount.toString() },
          { label: "Ticket promedio", value: formatMoney(avgTicket) },
        ],
        table: {
          columns: ["Día", "Ventas", "Tickets", "Ticket promedio"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "pos-performance": {
      const posMap = groupBy((sale) => sale.pos_name ?? "Sin POS");
      const rows = Array.from(posMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([pos, entry]) => [
          pos,
          formatMoney(entry.total),
          entry.count.toString(),
          `${((entry.total / totalNet) * 100).toFixed(1)}%`,
        ]);
      return {
        summary: [
          { label: "Total POS", value: rows.length.toString() },
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Ticket promedio", value: formatMoney(avgTicket) },
        ],
        table: {
          columns: ["POS", "Ventas", "Tickets", "Participación"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "seller-performance":
    case "pos-user-conciliation": {
      const vendorMap = groupBy((sale) => sale.vendor_name ?? "Sin vendedor");
      const rows = Array.from(vendorMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([vendor, entry]) => [
          vendor,
          formatMoney(entry.total),
          entry.count.toString(),
          formatMoney(entry.count ? entry.total / entry.count : 0),
        ]);
      return {
        summary: [
          { label: "Vendedores activos", value: rows.length.toString() },
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Ticket promedio", value: formatMoney(avgTicket) },
        ],
        table: {
          columns: ["Vendedor", "Ventas", "Tickets", "Ticket promedio"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "hourly-sales": {
      const hoursMap = new Map<
        number,
        { total: number; count: number }
      >();
      let minHour = 23;
      let maxHour = 0;
      sales.forEach((sale) => {
        const date = new Date(sale.created_at);
        if (Number.isNaN(date.getTime())) return;
        const hour = date.getHours();
        minHour = Math.min(minHour, hour);
        maxHour = Math.max(maxHour, hour);
        if (!hoursMap.has(hour)) {
          hoursMap.set(hour, { total: 0, count: 0 });
        }
        const entry = hoursMap.get(hour)!;
        entry.total += sale.total ?? 0;
        entry.count += 1;
      });
      if (!hoursMap.size) {
        return {
          summary: [
            { label: "Ventas netas", value: formatMoney(totalNet) },
            { label: "Tickets", value: ticketCount.toString() },
            { label: "Hora pico", value: "—" },
          ],
          table: {
            columns: ["Hora", "Tickets", "Ventas", "% de ventas"],
            rows: [],
            emptyMessage: "No hay datos con los filtros actuales.",
          },
        };
      }
      const hourLabel = (hour: number) =>
        `${hour.toString().padStart(2, "0")}:00 – ${(
          (hour + 1) %
          24
        )
          .toString()
          .padStart(2, "0")}:00`;
      const rows: Array<Array<string>> = [];
      for (let hour = minHour; hour <= maxHour; hour += 1) {
        const entry = hoursMap.get(hour) ?? { total: 0, count: 0 };
        rows.push([
          hourLabel(hour),
          entry.count.toString(),
          formatMoney(entry.total),
          totalNet > 0
            ? `${((entry.total / totalNet) * 100).toFixed(1)}%`
            : "0%",
        ]);
      }
      const peakHour = Array.from(hoursMap.entries()).reduce(
        (best, current) => {
          if (!best || current[1].total > best[1].total) return current;
          return best;
        },
        null as [number, { total: number; count: number }] | null
      );
      return {
        summary: [
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Tickets", value: ticketCount.toString() },
          {
            label: "Hora pico",
            value: peakHour ? hourLabel(peakHour[0]) : "—",
          },
        ],
        table: {
          columns: ["Hora", "Tickets", "Ventas", "% de ventas"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "payment-methods": {
      const methodMap = new Map<
        string,
        { total: number; count: number }
      >();
      const combineSale = (method: string, amount: number) => {
        const key = method || "Sin método";
        if (!methodMap.has(key)) {
          methodMap.set(key, { total: 0, count: 0 });
        }
        const entry = methodMap.get(key)!;
        entry.total += amount;
        entry.count += 1;
      };
      sales.forEach((sale) => {
        const payments = sale.payments;
        if (Array.isArray(payments) && payments.length > 1) {
          const sumPayments = payments.reduce(
            (sum, payment) => sum + (payment.amount ?? 0),
            0
          );
          const saleTotal = sale.total ?? sale.paid_amount ?? sumPayments;
          payments.forEach((payment) => {
            const rawAmount = payment.amount ?? 0;
            const value =
              sumPayments > 0
                ? (rawAmount / sumPayments) * saleTotal
                : saleTotal / payments.length;
            combineSale(payment.method ?? sale.payment_method ?? "Sin método", value);
          });
        } else {
          combineSale(
            sale.payment_method ?? payments?.[0]?.method ?? "Sin método",
            sale.total ?? sale.paid_amount ?? payments?.[0]?.amount ?? 0
          );
        }
      });
      const rows = Array.from(methodMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([method, entry]) => {
          const resolvedLabel =
            method === "Sin método"
              ? "Sin método"
              : resolvePaymentLabel(method);
          return [
            resolvedLabel,
            formatMoney(entry.total),
            entry.count.toString(),
            totalNet > 0
              ? `${((entry.total / totalNet) * 100).toFixed(1)}%`
              : "0%",
          ];
        });
      const dominant = rows[0]?.[0] ?? "—";
      return {
        summary: [
          { label: "Métodos activos", value: rows.length.toString() },
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Método dominante", value: dominant },
        ],
        table: {
          columns: ["Método", "Ventas", "Tickets", "Participación"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "client-segmentation": {
      const clientMap = new Map<
        string,
        { total: number; count: number; last: string }
      >();
      sales.forEach((sale) => {
        const key = sale.customer_name ?? sale.customer_email ?? "Sin cliente";
        if (!clientMap.has(key)) {
          clientMap.set(key, { total: 0, count: 0, last: sale.created_at });
        }
        const entry = clientMap.get(key)!;
        entry.total += sale.total ?? 0;
        entry.count += 1;
        if (sale.created_at > entry.last) entry.last = sale.created_at;
      });
      const rows = Array.from(clientMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 15)
        .map(([client, entry]) => [
          client,
          formatMoney(entry.total),
          entry.count.toString(),
          new Date(entry.last).toLocaleDateString("es-CO"),
        ]);
      return {
        summary: [
          { label: "Clientes únicos", value: clientMap.size.toString() },
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Ticket promedio", value: formatMoney(avgTicket) },
        ],
        table: {
          columns: ["Cliente", "Ventas", "Tickets", "Última compra"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "surcharge-summary": {
      const surchargeSales = sales.filter(
        (sale) => (sale.surcharge_amount ?? 0) > 0
      );
      const rows = surchargeSales.map((sale) => [
        dateTimeFormatter(sale.created_at),
        sale.document_number
          ? sale.document_number
          : sale.sale_number
          ? `#${sale.sale_number.toString().padStart(4, "0")}`
          : "—",
        sale.pos_name ?? "Sin POS",
        sale.vendor_name ?? "Sin vendedor",
        resolvePaymentLabel(sale.payment_method ?? "Sin método"),
        formatMoney(sale.surcharge_amount ?? 0),
        formatMoney(sale.total ?? 0),
      ]);
      const surchargeTickets = surchargeSales.length;
      const totalSurchargeValue = surchargeSales.reduce(
        (sum, sale) => sum + Math.max(0, sale.surcharge_amount ?? 0),
        0
      );
      const averageSurcharge =
        surchargeTickets > 0 ? totalSurchargeValue / surchargeTickets : 0;
      return {
        summary: [
          {
            label: "Total incremento",
            value: formatMoney(totalSurchargeValue),
          },
          {
            label: "Tickets con incremento",
            value: surchargeTickets.toString(),
          },
          {
            label: "Incremento promedio",
            value: formatMoney(averageSurcharge),
          },
        ],
        table: {
          columns: [
            "Fecha",
            "Documento",
            "POS",
            "Vendedor",
            "Método",
            "Recargo",
            "Total venta",
          ],
          rows,
          emptyMessage:
            "No se registraron incrementos en este periodo seleccionado.",
        },
        surchargeTotal: totalSurchargeValue,
      };
    }
    case "loyalty-repeat": {
      const clientCounts = new Map<string, number>();
      sales.forEach((sale) => {
        const key = sale.customer_name ?? sale.customer_email ?? "Sin cliente";
        clientCounts.set(key, (clientCounts.get(key) ?? 0) + 1);
      });
      let newClients = 0;
      let returning = 0;
      clientCounts.forEach((count) => {
        if (count > 1) returning += 1;
        else newClients += 1;
      });
      const rows = Array.from(clientCounts.entries())
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .map(([client, count]) => [
          client,
          count > 1 ? "Recurrente" : "Nuevo",
          `${count} compra${count > 1 ? "s" : ""}`,
        ]);
      return {
        summary: [
          { label: "Clientes nuevos", value: newClients.toString() },
          { label: "Clientes recurrentes", value: returning.toString() },
          {
            label: "Tasa de repetición",
            value:
              clientCounts.size > 0
                ? `${((returning / clientCounts.size) * 100).toFixed(1)}%`
                : "0%",
          },
        ],
        table: {
          columns: ["Cliente", "Tipo", "Compras"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "discounts-report": {
      let discountTotal = 0;
      sales.forEach((sale) => {
        discountTotal += sale.cart_discount_value ?? 0;
        sale.items?.forEach((item) => {
          discountTotal += item.line_discount_value ?? 0;
        });
      });
      const gross = totalNet + discountTotal;
      return {
        summary: [
          { label: "Descuento aplicado", value: formatMoney(discountTotal) },
          {
            label: "% sobre ventas",
            value: gross
              ? `${((discountTotal / gross) * 100).toFixed(1)}%`
              : "0%",
          },
          { label: "Ventas netas", value: formatMoney(totalNet) },
        ],
        table: {
          columns: ["Detalle", "Valor"],
          rows: [
            ["Ventas brutas", formatMoney(gross)],
            ["Ventas netas", formatMoney(totalNet)],
            ["Total descuento", formatMoney(discountTotal)],
          ],
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "payments-reconciliation": {
      const methodMap = groupBy((sale) => sale.payment_method ?? "Sin dato");
      const rows = Array.from(methodMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .map(([method, entry]) => {
          const resolvedLabel =
            method === "Sin dato"
              ? "Sin dato"
              : resolvePaymentLabel(method);
          return [
            resolvedLabel,
            formatMoney(entry.total),
            entry.count.toString(),
            `${((entry.total / totalNet) * 100).toFixed(1)}%`,
          ];
        });
      return {
        summary: [
          { label: "Métodos usados", value: rows.length.toString() },
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Ticket promedio", value: formatMoney(avgTicket) },
        ],
        table: {
          columns: ["Método", "Ventas", "Tickets", "Participación"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "credit-balance": {
      const creditSales = sales.filter((sale) => {
        const method = normalizeText(sale.payment_method);
        const isCredit =
          method === "credit" ||
          method === "credito" ||
          method === "separado";
        if (isCredit) return true;
        return (sale.payments ?? []).some((payment) => {
          const paymentMethod = normalizeText(payment.method);
          return (
            paymentMethod === "credit" ||
            paymentMethod === "credito" ||
            paymentMethod === "separado"
          );
        });
      });
      const outstanding = creditSales.reduce((sum, sale) => {
        const paid = sale.paid_amount ?? 0;
        return sum + Math.max(0, (sale.total ?? 0) - paid);
      }, 0);
      const rows = creditSales.map((sale) => [
        sale.customer_name ?? "Sin cliente",
        formatMoney(sale.total ?? 0),
        formatMoney(sale.paid_amount ?? 0),
        formatMoney(Math.max(0, (sale.total ?? 0) - (sale.paid_amount ?? 0))),
      ]);
      return {
        summary: [
          {
            label: "Ventas a crédito",
            value: creditSales.length.toString(),
          },
          { label: "Saldo pendiente", value: formatMoney(outstanding) },
          { label: "Total crédito", value: formatMoney(totalNet) },
        ],
        table: {
          columns: ["Cliente", "Total", "Pagado", "Saldo"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "products-top": {
      const productMap = new Map<
        string,
        {
          sku?: string | null;
          group?: string | null;
          total: number;
          units: number;
          last: string;
        }
      >();
      sales.forEach((sale) => {
        sale.items?.forEach((item) => {
          const key = item.product_name ?? item.name ?? "Sin nombre";
          if (!productMap.has(key)) {
            productMap.set(key, {
              sku: item.product_sku ?? null,
              group: item.product_group ?? item.product_category ?? null,
              total: 0,
              units: 0,
              last: sale.created_at,
            });
          }
          const entry = productMap.get(key)!;
          entry.total += (item.unit_price ?? 0) * (item.quantity ?? 0);
          entry.units += item.quantity ?? 0;
          if (!entry.sku && item.product_sku) entry.sku = item.product_sku;
          if (!entry.group && (item.product_group || item.product_category)) {
            entry.group = item.product_group ?? item.product_category ?? null;
          }
          if (sale.created_at > entry.last) entry.last = sale.created_at;
        });
      });
      const entriesArray = Array.from(productMap.entries());
      const rows = entriesArray
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, entry]) => [
          entry.sku ?? "—",
          name,
          entry.group ?? "—",
          entry.units.toString(),
          formatMoney(entry.total),
          dateTimeFormatter(entry.last),
        ]);
      const totalUnits = entriesArray.reduce(
        (sum, [, entry]) => sum + entry.units,
        0
      );
      const totalProductsValue = entriesArray.reduce(
        (sum, [, entry]) => sum + entry.total,
        0
      );
      return {
        summary: [
          { label: "Productos únicos", value: productMap.size.toString() },
          { label: "Unidades vendidas", value: totalUnits.toString() },
          {
            label: "Valor generado",
            value: formatMoney(totalProductsValue),
          },
        ],
        table: {
          columns: [
            "SKU",
            "Producto",
            "Categoría / grupo",
            "Unidades",
            "Ventas",
            "Última venta",
          ],
          rows,
          emptyMessage:
            "Aún no tenemos ventas asociadas a productos en este periodo.",
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "products-sold": {
      const rows: Array<Array<string>> = [];
      let units = 0;
      let subtotal = 0;
      const uniqueProducts = new Set<string>();
      sales.forEach((sale) => {
        sale.items?.forEach((item) => {
          const productName =
            item.product_name ?? item.name ?? "Producto sin nombre";
          uniqueProducts.add(productName);
          const quantity = item.quantity ?? 0;
          const unitPrice = item.unit_price ?? 0;
          units += quantity;
          subtotal += unitPrice * quantity;
          rows.push([
            dateFormatter(sale.created_at),
            productName,
            item.product_sku ?? "—",
            formatMoney(unitPrice),
            quantity.toString(),
            sale.document_number
              ? sale.document_number
              : sale.sale_number
              ? `#${sale.sale_number.toString().padStart(4, "0")}`
              : "—",
          ]);
        });
      });
      return {
        summary: [
          { label: "Unidades vendidas", value: units.toString() },
          { label: "Productos únicos", value: uniqueProducts.size.toString() },
          { label: "Valor de productos", value: formatMoney(subtotal) },
        ],
        table: {
          columns: [
            "Fecha",
            "Producto",
            "Código / SKU",
            "Precio unitario",
            "Cantidad",
            "Ticket",
          ],
          rows,
          emptyMessage: "No se registraron productos vendidos en este periodo.",
        },
        note:
          "Incluye cada artículo vendido con el ticket al que pertenece. Utiliza la exportación para obtener el detalle completo.",
        surchargeTotal: totalSurcharge,
      };
    }
    default:
      return {
        summary: [
          {
            label: "Estado",
            value: "Próximamente",
          },
          { label: "Ventas netas", value: formatMoney(totalNet) },
          { label: "Tickets", value: ticketCount.toString() },
        ],
        note:
          "Este reporte se conectará próximamente al backend para ofrecer datos completos.",
        surchargeTotal: totalSurcharge,
      };
  }
}

type ReportDocumentViewerProps = {
  preset: ReportPreset;
  filterMeta: FilterMeta;
  salesData: ReportSale[];
  companyInfo: CompanyInfo;
  settingsError?: string | null;
  onClose?: () => void;
  resolveMethodLabel: PaymentLabelResolver;
};

const dateFormatter = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("es-CO");
};

function ReportDocumentViewer({
  preset,
  filterMeta,
  salesData,
  companyInfo,
  settingsError,
  onClose,
  resolveMethodLabel,
}: ReportDocumentViewerProps) {
  const [pageIndex, setPageIndex] = useState(0);

  const filteredSales = useMemo(
    () => filterSalesByMeta(salesData, filterMeta),
    [salesData, filterMeta]
  );

  const result = useMemo(
    () =>
      buildReportResult(
        preset.id,
        filteredSales,
        resolveMethodLabel
      ),
    [preset.id, filteredSales, resolveMethodLabel]
  );
  const documentData = useMemo(() => {
    const tableRows = result?.table?.rows ?? [];
    const rowsPerPage = (() => {
      if (preset.id === "hourly-sales") return 16;
      if (preset.id === "month-daily") return 18;
      return TABLE_ROWS_PER_PAGE;
    })();
    const chartConfig = getChartConfig(preset.id, tableRows);
    const rowChunks = buildRowChunks(preset.id, tableRows, rowsPerPage);
    const tablePagesCount = rowChunks.length;
    const totalPages = tablePagesCount + (chartConfig ? 1 : 0);
    const safeTotalPages = Math.max(totalPages, 1);
    const currentIndex = Math.min(
      Math.max(pageIndex, 0),
      safeTotalPages - 1
    );
    const chartUsesLandscape =
      !!chartConfig && chartConfig.type !== "payment-bars";
    const isChartPage =
      !!chartConfig && currentIndex === tablePagesCount;
    return {
      totalPages: safeTotalPages,
      currentIndex,
      isChartPage,
      chartUsesLandscape,
    };
  }, [result, pageIndex, preset.id]);

  const handlePrint = useCallback(() => {
    if (!result) return;
    const documentTitle = getReportDocumentTitle(preset, filterMeta);
    const html = buildDocumentHtml(
      preset,
      result,
      companyInfo,
      filterMeta,
      resolveMethodLabel
    );
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.document.title = documentTitle;
    win.focus();
    win.print();
  }, [result, preset, companyInfo, filterMeta, resolveMethodLabel]);

  const handleDownloadPdf = useCallback(() => {
    // Se utiliza el mismo flujo de impresión para permitir "Guardar como PDF".
    handlePrint();
  }, [handlePrint]);

  const {
    totalPages,
    currentIndex,
    isChartPage,
    chartUsesLandscape,
  } = documentData;

  const isLandscapeChartPage = isChartPage && chartUsesLandscape;
  const previewHtml = useMemo(() => {
    if (!result) return "";
    return buildDocumentHtml(
      preset,
      result,
      companyInfo,
      filterMeta,
      resolveMethodLabel,
      { pageIndex: currentIndex }
    );
  }, [
    result,
    preset,
    companyInfo,
    filterMeta,
    resolveMethodLabel,
    currentIndex,
  ]);
  const previewWidthPx =
    (isLandscapeChartPage ? PAGE_HEIGHT_MM : PAGE_WIDTH_MM) * MM_TO_PX;
  const previewHeightPx =
    (isLandscapeChartPage ? PAGE_WIDTH_MM : PAGE_HEIGHT_MM) * MM_TO_PX;

  // La previsualización se renderiza ahora directamente desde el HTML del PDF.

  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-300">
        No hay datos para este reporte con los filtros seleccionados.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-400">
            Informe generado
          </p>
          <h2 className="text-2xl font-semibold text-slate-100">
            {preset.title}
          </h2>
          <p className="text-sm text-slate-400 max-w-3xl">
            {preset.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-emerald-400"
            onClick={handleDownloadPdf}
          >
            Descargar PDF
          </button>
          <button className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-emerald-400">
            Descargar CSV
          </button>
          <button
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-emerald-400"
            onClick={handlePrint}
          >
            Imprimir
          </button>
          {onClose && (
            <button
              className="px-3 py-1.5 rounded-md border border-rose-500/40 text-rose-200 hover:border-rose-400"
              onClick={onClose}
            >
              Cerrar pestaña
            </button>
          )}
        </div>
      </div>

      {settingsError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-100 px-4 py-3">
          {settingsError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 text-xs text-slate-300">
        <button
          className="px-2 py-1 rounded border border-slate-700 disabled:opacity-40"
          onClick={() => setPageIndex((idx) => Math.max(idx - 1, 0))}
          disabled={currentIndex === 0}
        >
          ←
        </button>
        <span>
          Página {currentIndex + 1} / {totalPages}
        </span>
        <button
          className="px-2 py-1 rounded border border-slate-700 disabled:opacity-40"
          onClick={() =>
            setPageIndex((idx) => Math.min(idx + 1, totalPages - 1))
          }
          disabled={currentIndex === totalPages - 1}
        >
          →
        </button>
      </div>

      <div className="flex justify-center">
        {previewHtml ? (
          <div
            className="rounded-2xl shadow-2xl border border-slate-800 bg-white overflow-hidden"
            style={{
              width: `${previewWidthPx}px`,
              height: `${previewHeightPx + 80}px`,
            }}
          >
            <iframe
              key={`${preset.id}-${currentIndex}`}
              srcDoc={previewHtml}
              title={`Vista previa ${preset.title} página ${currentIndex + 1}`}
              style={{
                width: `${previewWidthPx}px`,
                height: `${previewHeightPx}px`,
                overflow: "hidden",
                border: "0",
                display: "block",
              }}
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-900/50 px-6 py-12 text-center text-sm text-slate-400">
            No hay vista previa disponible.
          </div>
        )}
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const { token } = useAuth();
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : null),
    [token]
  );
  const { catalog, getPaymentLabel } =
    usePaymentMethodLabelResolver();
  const resolveMethodLabel = useCallback(
    (method: string) => getPaymentLabel(method, method),
    [getPaymentLabel]
  );

  const defaultDates = useMemo(getDefaultDates, []);
  const [range, setRange] = useState<QuickRange>("month");
  const [fromDate, setFromDate] = useState<string>(defaultDates.fromDate);
  const [toDate, setToDate] = useState<string>(defaultDates.toDate);
  const [posFilter, setPosFilter] = useState<string>("todos");
  const [sellerFilter, setSellerFilter] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const paymentOptions = useMemo(
    () =>
      [...catalog]
        .filter((method) => method.is_active)
        .sort((a, b) => a.order_index - b.order_index),
    [catalog]
  );

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [openReports, setOpenReports] = useState<OpenReportTab[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(OPEN_REPORTS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidOpenReportTab);
    } catch (err) {
      console.warn("No se pudieron cargar los reportes abiertos", err);
      return [];
    }
  });
  const tabsInitializedRef = useRef(false);
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (typeof window === "undefined") return "selector";
    const stored = window.localStorage.getItem(
      ACTIVE_REPORT_TAB_STORAGE_KEY
    );
    return stored || "selector";
  });

  const [salesData, setSalesData] = useState<ReportSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [favoriteReportIds, setFavoriteReportIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (id: unknown): id is string => typeof id === "string"
        );
      }
    } catch (err) {
      console.warn("No se pudieron cargar favoritos", err);
    }
    return [];
  });

  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(
    null
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const filterMeta: FilterMeta = useMemo(
    () => ({
      fromDate,
      toDate,
      posFilter,
      methodFilter,
      sellerFilter,
    }),
    [fromDate, toDate, posFilter, methodFilter, sellerFilter]
  );
  const methodFilterLabel = useMemo(
    () =>
      methodFilter === "todos"
        ? "Todos"
        : resolveMethodLabel(methodFilter),
    [methodFilter, resolveMethodLabel]
  );

  const companyInfo = useMemo<CompanyInfo>(() => {
    if (!posSettings) return FALLBACK_COMPANY;
    const rawLogo =
      posSettings.logoUrl ??
      posSettings.logo_url ??
      posSettings.ticket_logo_url ??
      "";
    return {
      name: posSettings.company_name?.trim() || FALLBACK_COMPANY.name,
      address: posSettings.address?.trim() || FALLBACK_COMPANY.address,
      email: posSettings.contact_email?.trim() || FALLBACK_COMPANY.email,
      phone: posSettings.contact_phone?.trim() || FALLBACK_COMPANY.phone,
      logoUrl: rawLogo.trim() || "",
    };
  }, [posSettings]);

  const currentPreset = useMemo(
    () =>
      selectedPresetId
        ? REPORT_PRESETS.find((p) => p.id === selectedPresetId) ?? null
        : null,
    [selectedPresetId]
  );

  const filteredSalesForPreview = useMemo(
    () => filterSalesByMeta(salesData, filterMeta),
    [salesData, filterMeta]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(favoriteReportIds)
      );
    } catch (err) {
      console.warn("No se pudieron guardar favoritos", err);
    }
  }, [favoriteReportIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (openReports.length) {
        window.localStorage.setItem(
          OPEN_REPORTS_STORAGE_KEY,
          JSON.stringify(openReports)
        );
      } else {
        window.localStorage.removeItem(OPEN_REPORTS_STORAGE_KEY);
      }
    } catch (err) {
      console.warn("No se pudieron guardar las pestañas de reportes", err);
    }
  }, [openReports]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeTabId && activeTabId !== "selector") {
        window.localStorage.setItem(
          ACTIVE_REPORT_TAB_STORAGE_KEY,
          activeTabId
        );
      } else {
        window.localStorage.removeItem(ACTIVE_REPORT_TAB_STORAGE_KEY);
      }
    } catch (err) {
      console.warn("No se pudo guardar la pestaña activa de reportes", err);
    }
  }, [activeTabId]);

  useEffect(() => {
    if (!openReports.length) {
      tabsInitializedRef.current = true;
      if (activeTabId !== "selector") {
        setActiveTabId("selector");
      }
      return;
    }
    if (activeTabId === "selector") {
      if (!tabsInitializedRef.current) {
        setActiveTabId(openReports[0].id);
      }
      tabsInitializedRef.current = true;
      return;
    }
    const exists = openReports.some((tab) => tab.id === activeTabId);
    if (!exists) {
      setActiveTabId(openReports[0].id);
    }
    tabsInitializedRef.current = true;
  }, [openReports, activeTabId]);

  const globalPreviewResult = useMemo(
    () =>
      filteredSalesForPreview.length
        ? buildReportResult(
            "daily-sales",
            filteredSalesForPreview,
            resolveMethodLabel
          )
        : null,
    [filteredSalesForPreview, resolveMethodLabel]
  );

  const handleQuickRange = (value: QuickRange) => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    switch (value) {
      case "today":
        break;
      case "yesterday":
        start.setDate(now.getDate() - 1);
        end = new Date(start);
        break;
      case "week":
        start.setDate(now.getDate() - 6);
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        break;
    }
    setRange(value);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
  };

  const loadSales = useCallback(async () => {
    if (!authHeaders) return;
    try {
      setSalesLoading(true);
      setSalesError(null);
      const apiBase = getApiBase();
      const res = await fetch(
        `${apiBase}/pos/sales?skip=0&limit=${REPORT_LIMIT}`,
        {
          headers: authHeaders,
          credentials: "include",
        }
      );
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const data: ReportSale[] = await res.json();
      setSalesData(data);
    } catch (err) {
      console.error(err);
      setSalesError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar la información de ventas."
      );
    } finally {
      setSalesLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    let active = true;
    if (!token) return;
    (async () => {
      try {
        const settings = await fetchPosSettings(token);
        if (active) {
          setPosSettings(settings);
          setSettingsError(null);
        }
      } catch (err) {
        console.error("No se pudieron cargar las configuraciones", err);
        if (active) {
          setSettingsError(
            err instanceof Error ? err.message : "Error al cargar ajustes."
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSelectPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    setActiveTabId("selector");
  }, []);

  const toggleFavorite = useCallback((presetId: string) => {
    setFavoriteReportIds((prev) => {
      const exists = prev.includes(presetId);
      return exists ? prev.filter((id) => id !== presetId) : [...prev, presetId];
    });
  }, []);

  const handleOpenReport = useCallback(() => {
    if (!currentPreset) return;
    const instanceId = `${currentPreset.id}-${Date.now()}`;
    const newTab: OpenReportTab = {
      id: instanceId,
      presetId: currentPreset.id,
      filterMeta: { ...filterMeta },
      createdAt: new Date().toISOString(),
    };
    setOpenReports((prev) => [...prev, newTab]);
    setActiveTabId(instanceId);
  }, [currentPreset, filterMeta]);

  const handleCloseReportTab = useCallback((id: string) => {
    setOpenReports((prev) => prev.filter((tab) => tab.id !== id));
    setActiveTabId((current) => {
      if (current !== id) return current;
      // Si cerramos la pestaña activa, volvemos al selector
      return "selector";
    });
  }, []);

  const groupedPresets = useMemo(
    () =>
      REPORT_PRESETS.reduce<Record<string, ReportPreset[]>>(
        (groups, preset) => {
          if (!groups[preset.scope]) groups[preset.scope] = [];
          groups[preset.scope].push(preset);
          return groups;
        },
        {}
      ),
    []
  );

  const favoritePresets = useMemo(
    () =>
      REPORT_PRESETS.filter((preset) =>
        favoriteReportIds.includes(preset.id)
      ),
    [favoriteReportIds]
  );

  const renderPresetRow = useCallback(
    (preset: ReportPreset) => {
      const isActive = selectedPresetId === preset.id;
      const isFavorite = favoriteReportIds.includes(preset.id);
      return (
        <li
          key={preset.id}
          className={`px-4 py-3 flex items-start gap-3 cursor-pointer ${
            isActive ? "bg-emerald-500/10" : "hover:bg-slate-900"
          }`}
          onClick={() => handleSelectPreset(preset.id)}
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100">{preset.title}</p>
            <p className="text-[11px] text-slate-400 line-clamp-2">
              {preset.description}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Alcance: {preset.scope}
            </p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFavorite(preset.id);
            }}
            className={`text-lg ${
              isFavorite
                ? "text-amber-400 hover:text-amber-300"
                : "text-slate-500 hover:text-slate-300"
            }`}
            aria-label={
              isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"
            }
          >
            {isFavorite ? "★" : "☆"}
          </button>
        </li>
      );
    },
    [selectedPresetId, favoriteReportIds, handleSelectPreset, toggleFavorite]
  );

  const activeReportTab =
    activeTabId === "selector"
      ? null
      : openReports.find((tab) => tab.id === activeTabId) ?? null;

  return (
    <main className="flex-1 px-6 py-6 text-slate-50">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Header principal */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-400 font-semibold">
              Panel Metrik
            </p>
            <h1 className="text-3xl font-bold">Reportes e informes</h1>
            <p className="text-sm text-slate-400 max-w-2xl mt-1">
              Selecciona un informe, ajusta los filtros y genera documentos
              listos para imprimir, exportar o compartir, al estilo Aronium.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(
              [
                { id: "today", label: "Hoy" },
                { id: "yesterday", label: "Ayer" },
                { id: "week", label: "Últimos 7 días" },
                { id: "month", label: "Este mes" },
                { id: "year", label: "Este año" },
              ] as { id: QuickRange; label: string }[]
            ).map((quick) => (
              <button
                key={quick.id}
                onClick={() => handleQuickRange(quick.id)}
                className={`px-3 py-1.5 rounded-full border text-xs ${
                  range === quick.id
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-400/50"
                }`}
              >
                {quick.label}
              </button>
            ))}
          </div>
        </header>

        {/* Barra de pestañas (selector + informes abiertos) */}
        <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-sm">
          <button
            className={`px-3 py-2 border-b-2 ${
              activeTabId === "selector"
                ? "border-emerald-400 text-emerald-200"
                : "border-transparent text-slate-400 hover:text-slate-100"
            }`}
            onClick={() => setActiveTabId("selector")}
          >
            Seleccionar informe
          </button>
          {openReports.map((tab) => {
            const preset = REPORT_PRESETS.find((p) => p.id === tab.presetId);
            if (!preset) return null;
            const isActive = activeTabId === tab.id;
            return (
              <div
                key={tab.id}
                className={`flex items-center gap-1 px-3 py-2 border-b-2 ${
                  isActive
                    ? "border-emerald-400 text-emerald-200"
                    : "border-transparent text-slate-400 hover:text-slate-100"
                }`}
              >
                <button
                  className="text-xs"
                  onClick={() => setActiveTabId(tab.id)}
                >
                  {preset.title}
                </button>
                <button
                  className="text-xs text-slate-500 hover:text-rose-300"
                  onClick={() => handleCloseReportTab(tab.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Contenido según pestaña activa */}
        {activeReportTab && (
          <ReportDocumentViewer
            preset={
              REPORT_PRESETS.find((p) => p.id === activeReportTab.presetId)!
            }
            filterMeta={activeReportTab.filterMeta}
            salesData={salesData}
            companyInfo={companyInfo}
            settingsError={settingsError}
            onClose={() => handleCloseReportTab(activeReportTab.id)}
            resolveMethodLabel={resolveMethodLabel}
          />
        )}

        {!activeReportTab && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)]">
            {/* Columna izquierda: lista de reportes */}
            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    Catálogo de reportes
                  </h2>
                  <p className="text-sm text-slate-400">
                    Elige un informe de la lista. Luego ajusta los filtros en el
                    panel derecho y pulsa &quot;Mostrar reporte&quot;.
                  </p>
                </div>
              </div>

              <div className="space-y-4 max-h-[620px] overflow-auto pr-1">
                {favoritePresets.length > 0 && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5">
                    <div className="px-4 py-2 border-b border-amber-400/30 text-xs uppercase tracking-wide text-amber-300 flex items-center justify-between">
                      <span>Favoritos</span>
                      <span>{favoritePresets.length}</span>
                    </div>
                    <ul className="divide-y divide-amber-400/30 text-sm">
                      {favoritePresets.map((preset) => renderPresetRow(preset))}
                    </ul>
                  </div>
                )}
                {Object.entries(groupedPresets).map(([scope, presets]) => (
                  <div
                    key={scope}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70"
                  >
                    <div className="px-4 py-2 border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                      {scope}
                    </div>
                    <ul className="divide-y divide-slate-800 text-sm">
                      {presets.map((preset) => renderPresetRow(preset))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Columna derecha: filtros + resumen */}
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 md:p-6 space-y-5 backdrop-blur supports-[backdrop-filter]:bg-slate-950/55 shadow-lg sticky top-[4.5rem]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      Filtros del informe
                    </p>
                    <h3 className="text-base font-semibold text-slate-50">
                      Rango y alcance
                    </h3>
                  </div>
                  {currentPreset && (
                    <span className="text-[11px] text-slate-400 text-right">
                      Informe seleccionado:{" "}
                      <strong className="text-slate-100">
                        {currentPreset.title}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Fechas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-400 uppercase tracking-wide">
                          Desde
                        </span>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          onFocus={(e) => e.target.showPicker?.()}
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-400 uppercase tracking-wide">
                          Hasta
                        </span>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          onFocus={(e) => e.target.showPicker?.()}
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: "today", label: "Hoy" },
                          { id: "yesterday", label: "Ayer" },
                          { id: "week", label: "Últimos 7 días" },
                          { id: "month", label: "Este mes" },
                          { id: "year", label: "Este año" },
                        ] as { id: QuickRange; label: string }[]
                      ).map((quick) => (
                        <button
                          key={quick.id}
                          onClick={() => handleQuickRange(quick.id)}
                          className={`px-3 py-1.5 rounded-full border text-xs transition ${
                            range === quick.id
                              ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                              : "border-slate-700 bg-slate-900 text-slate-300 hover:border-emerald-400/50"
                          }`}
                        >
                          {quick.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Alcance
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-400 uppercase tracking-wide">
                          POS
                        </span>
                        <select
                          value={posFilter}
                          onChange={(e) => setPosFilter(e.target.value)}
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        >
                          <option value="todos">Todos los POS</option>
                          <option value="pos1">POS 1</option>
                          <option value="pos2">POS 2</option>
                          <option value="online">Ventas online</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-slate-400 uppercase tracking-wide">
                          Método de pago
                        </span>
                        <select
                          value={methodFilter}
                          onChange={(e) => setMethodFilter(e.target.value)}
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        >
                          <option value="todos">Todos</option>
                          {paymentOptions.map((method) => (
                            <option key={method.id} value={method.slug}>
                              {method.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs text-slate-400 uppercase tracking-wide">
                        Vendedor / responsable
                      </span>
                      <input
                        type="text"
                        value={sellerFilter}
                        onChange={(e) => setSellerFilter(e.target.value)}
                        placeholder="Buscar por nombre o documento"
                        className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                    <span>
                      <strong className="text-slate-200">POS:</strong>{" "}
                      {posFilter}
                    </span>
                    <span>·</span>
                    <span>
                      <strong className="text-slate-200">Método:</strong>{" "}
                      {methodFilterLabel}
                    </span>
                    <span>·</span>
                    <span>
                      <strong className="text-slate-200">Vendedor:</strong>{" "}
                      {sellerFilter || "todos"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                    className="px-4 py-2.5 text-xs rounded-lg border border-slate-700/80 bg-slate-950/70 hover:border-emerald-400 hover:bg-slate-900/60 transition"
                    disabled
                  >
                    Guardar filtro (próximamente)
                  </button>
                  <button
                    className="px-4 py-2.5 text-xs rounded-lg border border-slate-700/80 bg-slate-950/70 hover:border-emerald-400 hover:bg-slate-900/60 transition"
                    disabled
                  >
                    Compartir (próximamente)
                  </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-2 border-t border-slate-800">
                  <button
                    className="px-4 py-3 text-sm rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={handleOpenReport}
                    disabled={
                      !currentPreset ||
                      salesLoading ||
                      !salesData.length ||
                      !!salesError
                    }
                  >
                    {salesLoading
                      ? "Cargando ventas…"
                      : !currentPreset
                      ? "Selecciona un informe en la lista"
                      : "Mostrar reporte"}
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-xs rounded-lg border border-slate-700 text-slate-200 hover:border-emerald-400/80 bg-slate-950/70 transition"
                    onClick={() => {
                      setFromDate(defaultDates.fromDate);
                      setToDate(defaultDates.toDate);
                      setPosFilter("todos");
                      setMethodFilter("todos");
                      setSellerFilter("");
                    }}
                  >
                    Restablecer filtros
                  </button>
                  {salesError && (
                    <p className="text-xs text-rose-300">
                      Error al cargar las ventas: {salesError}
                    </p>
                  )}
                  {!salesError && !salesLoading && !salesData.length && (
                    <p className="text-xs text-slate-400">
                      Aún no hay datos de ventas desde el POS para este
                      periodo.
                    </p>
                  )}
                </div>
              </div>

              {/* Resumen rápido con filtros actuales */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3 text-sm">
                <p className="text-xs text-slate-400 uppercase tracking-wide">
                  Resumen rápido del periodo
                </p>
                {salesLoading ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={`summary-skeleton-${idx}`}
                        className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2 animate-pulse"
                      >
                        <div className="h-3 w-16 rounded bg-slate-800/70" />
                        <div className="mt-2 h-6 w-24 rounded bg-slate-800/70" />
                      </div>
                    ))}
                  </div>
                ) : globalPreviewResult ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {globalPreviewResult.summary.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg border border-slate-800/60 bg-slate-950/60 px-3 py-2"
                      >
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          {item.label}
                        </p>
                        <p className="text-lg font-semibold text-slate-100">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Ajusta las fechas y filtros para ver un resumen de ventas
                    rápidas del periodo.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
