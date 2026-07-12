"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";
import {
  exportReportExcel,
  exportReportPdf,
  fetchProductsSoldReport,
  fetchProductsByTarget,
  fetchReportFavorites,
  ReportFavoritesConflictError,
  saveReportFavorites,
} from "@/lib/api/reports";
import {
  defaultRolePermissions,
  fetchPosSettings,
  fetchRolePermissions,
  PosUserRecord,
  PosSettingsPayload,
  RolePermissionModule,
} from "@/lib/api/settings";
import { SHOW_FREE_SALE_TRACEABILITY_REPORT } from "@/lib/config/featureFlags";
import { usePaymentMethodLabelResolver } from "@/app/hooks/usePaymentMethodLabelResolver";
import LoadingSpinner from "../../../components/ui/LoadingSpinner";
import {
  buildBogotaDateFromKey,
  formatBogotaDate,
  getBogotaDateKey,
  getBogotaDateParts,
  parseDateInput,
} from "@/lib/time/bogota";

type QuickRange =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "previous_month"
  | "year"
  | "custom";

type ReportPreset = {
  id: string;
  title: string;
  description: string;
  scope: string;
  highlights: string[];
};

type ReportSaleItem = {
  product_id?: number;
  product_name?: string;
  name?: string;
  product_sku?: string | null;
  product_group?: string | null;
  product_category?: string | null;
  quantity: number;
  unit_price?: number;
  line_discount_value?: number;
};

type ReportSaleReturnItem = {
  product_id?: number | null;
  product_name?: string | null;
  product_sku?: string | null;
  quantity?: number;
};

type ReportSaleReturn = {
  status?: string | null;
  voided_at?: string | null;
  items?: ReportSaleReturnItem[];
};

type ReportChangeReturnItem = {
  product_id: number;
  product_name?: string | null;
  product_sku?: string | null;
  quantity: number;
  unit_price_net?: number | null;
};

type ReportChangeNewItem = {
  product_id: number;
  product_name?: string | null;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
};

type ReportChange = {
  sale_id: number;
  status: string;
  voided_at?: string | null;
  items_returned: ReportChangeReturnItem[];
  items_new: ReportChangeNewItem[];
};

type ReportSale = {
  id: number;
  sale_number?: number;
  document_number?: string;
  created_at: string;
  status?: string | null;
  voided_at?: string | null;
  total?: number;
  paid_amount?: number;
  payment_method?: string;
  payments?: Array<{ method?: string | null; amount?: number | null }>;
  is_separated?: boolean;
  initial_payment_method?: string | null;
  initial_payment_amount?: number | null;
  balance?: number | null;
  pos_name?: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  notes?: string | null;
  cart_discount_value?: number | null;
  cart_discount_percent?: number | null;
  items?: ReportSaleItem[];
  returns?: ReportSaleReturn[];
  surcharge_amount?: number | null;
  surcharge_label?: string | null;
};

type DashboardDailySalesPoint = {
  date: string;
  total: number;
  tickets: number;
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
  sourceFilter?: "all" | "metrik" | "aronium";
  productsTopSort?: "value" | "units";
  productsTopLimit?: number;
  productsTopScope?: "global" | "category";
  productsTopCategoryMode?: "group" | "subgroup";
  productsTopCategoryKey?: string;
  productsTopCategoryLabel?: string;
  categorySalesMode?: "full" | "main";
  productReportMode?: "product" | "group";
  productReportProductId?: number | null;
  productReportProductName?: string;
  productReportProductGroupName?: string;
  productReportGroupPath?: string;
  productReportGroupName?: string;
  productReportResultMode?: "detailed" | "grouped";
  productReportLastSaleByProductId?: Record<string, string>;
  productReportCostBySku?: Record<string, number>;
};

type OpenReportTab = {
  id: string;
  presetId: string;
  filterMeta: FilterMeta;
  createdAt: string;
  resultSnapshot?: ReportResult;
  snapshotSavedAt?: string;
};

type ProductSearchOption = {
  id: number;
  name: string;
  sku: string;
  groupName: string;
};

type ProductGroupOption = {
  id: number;
  path: string;
  displayName: string;
  parentPath?: string | null;
};

type DashboardRole = PosUserRecord["role"];

function isDashboardRole(role?: string | null): role is DashboardRole {
  return (
    role === "Administrador" ||
    role === "Supervisor" ||
    role === "Vendedor" ||
    role === "Auditor"
  );
}

const isValidFilterMeta = (value: unknown): value is FilterMeta => {
  if (!value || typeof value !== "object") return false;
  const meta = value as Record<string, unknown>;
  const mode = meta.productReportMode;
  const modeValid =
    mode === undefined || mode === "product" || mode === "group";
  const productsTopSortValid =
    meta.productsTopSort === undefined ||
    meta.productsTopSort === "value" ||
    meta.productsTopSort === "units";
  const productsTopScopeValid =
    meta.productsTopScope === undefined ||
    meta.productsTopScope === "global" ||
    meta.productsTopScope === "category";
  const productsTopCategoryModeValid =
    meta.productsTopCategoryMode === undefined ||
    meta.productsTopCategoryMode === "group" ||
    meta.productsTopCategoryMode === "subgroup";
  const productsTopLimitValid =
    meta.productsTopLimit === undefined ||
    (typeof meta.productsTopLimit === "number" &&
      Number.isFinite(meta.productsTopLimit));
  const productsTopCategoryKeyValid =
    meta.productsTopCategoryKey === undefined ||
    typeof meta.productsTopCategoryKey === "string";
  const productsTopCategoryLabelValid =
    meta.productsTopCategoryLabel === undefined ||
    typeof meta.productsTopCategoryLabel === "string";
  const categorySalesModeValid =
    meta.categorySalesMode === undefined ||
    meta.categorySalesMode === "full" ||
    meta.categorySalesMode === "main";
  return (
    typeof meta.fromDate === "string" &&
    typeof meta.toDate === "string" &&
    typeof meta.posFilter === "string" &&
    typeof meta.methodFilter === "string" &&
    typeof meta.sellerFilter === "string" &&
    productsTopSortValid &&
    productsTopScopeValid &&
    productsTopCategoryModeValid &&
    productsTopLimitValid &&
    productsTopCategoryKeyValid &&
    productsTopCategoryLabelValid &&
    categorySalesModeValid &&
    (meta.sourceFilter === undefined ||
      meta.sourceFilter === "all" ||
      meta.sourceFilter === "metrik" ||
      meta.sourceFilter === "aronium") &&
    modeValid &&
    (meta.productReportProductId === undefined ||
      meta.productReportProductId === null ||
      typeof meta.productReportProductId === "number") &&
    (meta.productReportProductName === undefined ||
      typeof meta.productReportProductName === "string") &&
    (meta.productReportProductGroupName === undefined ||
      typeof meta.productReportProductGroupName === "string") &&
    (meta.productReportGroupPath === undefined ||
      typeof meta.productReportGroupPath === "string") &&
    (meta.productReportGroupName === undefined ||
      typeof meta.productReportGroupName === "string") &&
    (meta.productReportResultMode === undefined ||
      meta.productReportResultMode === "detailed" ||
      meta.productReportResultMode === "grouped") &&
    (meta.productReportCostBySku === undefined ||
      (typeof meta.productReportCostBySku === "object" &&
        meta.productReportCostBySku !== null &&
        Object.values(meta.productReportCostBySku).every(
          (value) => typeof value === "number"
        )))
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
    isValidFilterMeta(tab.filterMeta) &&
    (tab.resultSnapshot === undefined ||
      isValidReportResult(tab.resultSnapshot)) &&
    (tab.snapshotSavedAt === undefined ||
      typeof tab.snapshotSavedAt === "string")
  );
};

const isValidReportResult = (value: unknown): value is ReportResult => {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ReportResult>;
  if (!Array.isArray(result.summary)) return false;
  const validSummary = result.summary.every(
    (item) =>
      !!item &&
      typeof item === "object" &&
      typeof (item as ReportSummaryItem).label === "string" &&
      typeof (item as ReportSummaryItem).value === "string"
  );
  if (!validSummary) return false;
  if (result.table !== undefined) {
    if (!result.table || typeof result.table !== "object") return false;
    const table = result.table as ReportTable;
    if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) return false;
    if (!table.columns.every((column) => typeof column === "string")) return false;
    if (
      !table.rows.every(
        (row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")
      )
    ) {
      return false;
    }
    if (
      table.emptyMessage !== undefined &&
      typeof table.emptyMessage !== "string"
    ) {
      return false;
    }
  }
  if (result.note !== undefined && typeof result.note !== "string") return false;
  if (
    result.surchargeTotal !== undefined &&
    typeof result.surchargeTotal !== "number"
  ) {
    return false;
  }
  return true;
};

const REPORT_PAGE_SIZE = 1000;
const REPORT_FETCH_TIMEOUT_MS = 45_000;
const REPORT_FETCH_TIMEOUT_SALES_ALL_MS = 180_000;
const REPORT_MAX_SALES_ROWS = 4_000;
const REPORT_MAX_CHANGES_ROWS = 2_000;
const PRODUCT_DETAILED_MAX_RANGE_DAYS = 62;
const REPORT_SNAPSHOT_TTL_MS = 20 * 60 * 1000;
const TABLE_ROWS_PER_PAGE = 18;
const PRODUCTS_GROUPED_ROWS_PER_PAGE = 26;
const MONTH_DAILY_ROWS_PER_PAGE = 28;
const PAPER_WIDTH_MM = 210; // A4
const PAPER_HEIGHT_MM = 297; // A4
const PAGE_MARGIN_MM = 2.5;
// Compensa diferencias entre preview y motor de impresion del navegador.
const PAGE_CONTENT_SLACK_MM = 1;
const PAGE_WIDTH_MM =
  PAPER_WIDTH_MM - PAGE_MARGIN_MM * 2 - PAGE_CONTENT_SLACK_MM;
const PAGE_HEIGHT_MM =
  PAPER_HEIGHT_MM - PAGE_MARGIN_MM * 2 - PAGE_CONTENT_SLACK_MM;
const MM_TO_PX = 96 / 25.4;

const getDefaultDates = () => {
  const todayKey = getBogotaDateKey();
  return {
    fromDate: todayKey,
    toDate: todayKey,
  };
};

const getMonthRangeFromKey = (referenceDateKey: string) => {
  const [yearRaw, monthRaw] = referenceDateKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const todayKey = getBogotaDateKey();
  const { year: currentYear, month: currentMonth } = getBogotaDateParts();

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    month < 1 ||
    month > 12 ||
    !yearRaw ||
    !monthRaw
  ) {
    return { fromDate: todayKey, toDate: todayKey };
  }

  const monthText = String(month).padStart(2, "0");
  const fromDate = `${yearRaw}-${monthText}-01`;

  if (yearRaw === currentYear && monthText === currentMonth) {
    return { fromDate, toDate: todayKey };
  }

  const monthEnd = new Date(Date.UTC(year, month, 0, 5, 0, 0));
  const { day: lastDay } = getBogotaDateParts(monthEnd);
  const toDate = `${yearRaw}-${monthText}-${lastDay}`;
  return { fromDate, toDate };
};
const REPORT_STORAGE_PREFIX = "kensar_report";
const HOURLY_CHART_BAR_MAX_HEIGHT = 260; // px for chart bars height
const LINE_CHART_WIDTH = 980;
const LINE_CHART_HEIGHT = 420;
const LINE_CHART_PADDING = {
  top: 26,
  right: 28,
  bottom: 126,
  left: 90,
};
const LINE_CHART_TICKS = 5;
const buildReportStorageKey = (scope: string, suffix: string) =>
  `${REPORT_STORAGE_PREFIX}_${scope}_${suffix}`;

const areSameStringArrays = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

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

const getColumnPresentation = (
  reportId: string,
  column: string
): ColumnPresentation => {
  const normalized = column.toLowerCase().trim();
  const presentation: ColumnPresentation = {
    align: "left",
    noWrap: false,
    isDateValue: false,
  };

  if (reportId === "free-sales-traceability") {
    if (normalized === "motivo") {
      presentation.width = 320;
      presentation.maxWidth = 320;
      presentation.clampLines = 4;
      return presentation;
    }
    if (normalized === "fecha") {
      presentation.width = 155;
      presentation.maxWidth = 155;
      presentation.noWrap = true;
      presentation.isDateValue = true;
      return presentation;
    }
    if (normalized === "precio") {
      presentation.width = 95;
      presentation.maxWidth = 95;
      presentation.align = "right";
      presentation.noWrap = true;
      return presentation;
    }
    if (normalized === "ticket") {
      presentation.width = 110;
      presentation.maxWidth = 110;
      presentation.noWrap = true;
      return presentation;
    }
  }

  if (reportId === "products-by-target") {
    if (normalized === "producto") {
      presentation.clampLines = 1;
      presentation.maxWidth = 220;
      presentation.width = 220;
      return presentation;
    }
    if (normalized === "grupo") {
      presentation.clampLines = 1;
      presentation.maxWidth = 75;
      presentation.width = 75;
      return presentation;
    }
    if (normalized === "precio") {
      presentation.width = 95;
      presentation.maxWidth = 95;
      presentation.align = "right";
      presentation.noWrap = true;
      return presentation;
    }
  }

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
  name: "",
  address: "",
  email: "",
  phone: "",
  logoUrl: "",
};

const formatMoney = (value: number | undefined | null) => {
  if (value == null || Number.isNaN(value)) return "$0";
  return `$${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const formatUtcNaiveForApi = (value: Date) => value.toISOString().slice(0, 19);

const buildBogotaRangeApiParams = (fromKey: string, toKey: string) => {
  const start = buildBogotaDateFromKey(fromKey);
  const end = buildBogotaDateFromKey(toKey);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    date_from: formatUtcNaiveForApi(start),
    date_to: formatUtcNaiveForApi(end),
  };
};

const normalizeText = (value: string | null | undefined) =>
  value?.toLowerCase().trim() ?? "";

const getLastGroupSegment = (value: string | null | undefined) => {
  const raw = (value ?? "").trim();
  if (!raw) return "—";
  const compact = raw.replace(/\s*\/\s*/g, "/").replace(/\s*>\s*/g, ">");
  const parts = compact
    .split(/[\/>]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const normalizeComparableText = (value: string | null | undefined) =>
  value
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    : "";

const FREE_SALE_NAME_FRAGMENT = "venta libre";

const isFreeSaleItem = (item: ReportSaleItem) => {
  const productName = normalizeComparableText(item.product_name ?? item.name);
  const sku = normalizeComparableText(item.product_sku);
  return (
    productName.includes(FREE_SALE_NAME_FRAGMENT) ||
    sku.includes("venta-libre") ||
    sku.includes(FREE_SALE_NAME_FRAGMENT)
  );
};

const extractFreeSaleReasonsFromNotes = (notes?: string | null): string[] => {
  const source = notes?.trim();
  if (!source) return [];
  const labelMatch = source.match(/motivo venta libre/i);
  if (!labelMatch || labelMatch.index == null) return [];
  const tail = source
    .slice(labelMatch.index + labelMatch[0].length)
    .replace(/^[\s:\-\n\r]+/, "");
  const firstBlock = tail.split(/\r?\n\r?\n/)[0] ?? "";
  const lines = firstBlock
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return [];
  const numbered = lines
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((line) => line.length > 0);
  return numbered;
};

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
  defaultSize: number,
  filterMeta?: FilterMeta
): string[][][] => {
  if (!rows.length) {
    return chunkArray(rows, defaultSize);
  }
  if (presetId === "products-sold") {
    // Reparto por capacidad real: primera pagina (con resumen),
    // paginas intermedias mas densas y ultima con reserva para nota/componentes.
    const firstPageSize = 30;
    const middlePageSize = 35;
    const lastPageSize = 28;
    // Reservamos espacio visual para nota + componentes en ultima pagina,
    // pero priorizamos llenar la penultima al maximo posible.
    const minLastPageRows = 8;
    const chunks: string[][][] = [];
    let startIndex = 0;
    if (rows.length) {
      const firstChunk = rows.slice(0, firstPageSize);
      if (firstChunk.length) {
        chunks.push(firstChunk);
      }
      startIndex = firstChunk.length;
    }

    const remainingRows = rows.slice(startIndex);
    if (remainingRows.length <= middlePageSize) {
      if (remainingRows.length) chunks.push(remainingRows);
      return chunks.length ? chunks : ([[]] as string[][][]);
    }

    let cursor = 0;
    while (remainingRows.length - cursor > middlePageSize + lastPageSize) {
      chunks.push(remainingRows.slice(cursor, cursor + middlePageSize));
      cursor += middlePageSize;
    }

    const finalBlock = remainingRows.slice(cursor);
    if (finalBlock.length <= middlePageSize) {
      chunks.push(finalBlock);
      return chunks;
    }
    if (finalBlock.length <= middlePageSize + minLastPageRows) {
      // Si el bloque final es apenas un poco mayor al limite intermedio,
      // evitamos crear una ultima pagina casi vacia.
      chunks.push(finalBlock);
      return chunks;
    }

    // Reparto "penultima llena": dejamos en la ultima solo lo necesario.
    // Ejemplo 41 filas => 29 + 12 (en vez de 23 + 18).
    let firstPageSizeAdjusted = Math.min(
      middlePageSize,
      Math.max(1, finalBlock.length - minLastPageRows)
    );
    let secondPageSize = finalBlock.length - firstPageSizeAdjusted;
    if (secondPageSize > lastPageSize) {
      secondPageSize = lastPageSize;
      firstPageSizeAdjusted = finalBlock.length - secondPageSize;
    }

    chunks.push(finalBlock.slice(0, firstPageSizeAdjusted));
    chunks.push(finalBlock.slice(firstPageSizeAdjusted));

    if (!chunks.length) {
      return [[]] as string[][][];
    }
    return chunks;
  }
  if (presetId === "products-by-target") {
    const groupedMode =
      filterMeta?.productReportResultMode === "grouped" ||
      (rows[0]?.length ?? 0) === 6;
    const firstPageBudget = groupedMode ? 24 : 18;
    const nextPageBudget = groupedMode ? 30 : 24;
    const calcRowWeight = (row: string[]): number => {
      if (groupedMode) {
        const productLen = (row[1] ?? "").length;
        const groupLen = (row[2] ?? "").length;
        const productExtra = Math.max(0, Math.ceil((productLen - 34) / 26));
        const groupExtra = Math.max(0, Math.ceil((groupLen - 20) / 26));
        return 1 + productExtra * 0.45 + groupExtra * 0.2;
      }
      const productLen = (row[1] ?? "").length;
      const groupLen = (row[6] ?? "").length;
      const posLen = (row[7] ?? "").length;
      const productExtra = Math.max(0, Math.ceil((productLen - 28) / 24));
      const groupExtra = Math.max(0, Math.ceil((groupLen - 18) / 22));
      const posExtra = Math.max(0, Math.ceil((posLen - 16) / 18));
      return 1 + productExtra * 0.5 + groupExtra * 0.2 + posExtra * 0.2;
    };

    const chunks: string[][][] = [];
    let cursor = 0;
    let currentBudget = firstPageBudget;
    while (cursor < rows.length) {
      let pageWeight = 0;
      const pageRows: string[][] = [];
      while (cursor < rows.length) {
        const row = rows[cursor];
        const rowWeight = calcRowWeight(row);
        if (pageRows.length > 0 && pageWeight + rowWeight > currentBudget) {
          break;
        }
        pageRows.push(row);
        pageWeight += rowWeight;
        cursor += 1;
      }
      if (!pageRows.length && cursor < rows.length) {
        pageRows.push(rows[cursor]);
        cursor += 1;
      }
      chunks.push(pageRows);
      currentBudget = nextPageBudget;
    }
    return chunks.length ? chunks : ([[]] as string[][][]);
  }
  if (presetId === "free-sales-traceability") {
    // La primera pagina incluye resumen/KPIs; las siguientes pueden cargar mas filas.
    // Ajustamos por longitud del motivo para evitar cortes visuales por wrapping.
    const firstPageBudget = 34;
    const nextPageBudget = 40;
    const calcRowWeight = (row: string[]): number => {
      const reasonLen = (row[1] ?? "").length;
      const reasonExtra = Math.max(0, Math.ceil((reasonLen - 52) / 28));
      return 1 + reasonExtra * 0.25;
    };

    const chunks: string[][][] = [];
    let cursor = 0;
    let currentBudget = firstPageBudget;
    while (cursor < rows.length) {
      let pageWeight = 0;
      const pageRows: string[][] = [];
      while (cursor < rows.length) {
        const row = rows[cursor];
        const rowWeight = calcRowWeight(row);
        if (pageRows.length > 0 && pageWeight + rowWeight > currentBudget) {
          break;
        }
        pageRows.push(row);
        pageWeight += rowWeight;
        cursor += 1;
      }
      if (!pageRows.length && cursor < rows.length) {
        pageRows.push(rows[cursor]);
        cursor += 1;
      }
      chunks.push(pageRows);
      currentBudget = nextPageBudget;
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

const applyCartDiscountToItems = (
  sale: ReportSale,
  items: ReportSaleItem[]
): ReportSaleItem[] => {
  const cartDiscount = Math.max(0, Number(sale.cart_discount_value ?? 0));
  if (cartDiscount <= 0 || items.length === 0) return items;

  const totals = items.map((item) => {
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    const unitPrice = Math.max(0, Number(item.unit_price ?? 0));
    return { quantity, lineTotal: unitPrice * quantity };
  });
  const subtotal = totals.reduce((sum, entry) => sum + entry.lineTotal, 0);
  if (subtotal <= 0) return items;

  let remainingDiscount = Math.min(cartDiscount, subtotal);
  return items.map((item, index) => {
    const { quantity, lineTotal } = totals[index];
    if (quantity <= 0 || lineTotal <= 0) {
      return item;
    }
    const rawShare =
      index === items.length - 1
        ? remainingDiscount
        : (lineTotal / subtotal) * cartDiscount;
    const discountShare = Math.max(0, Math.min(rawShare, remainingDiscount));
    remainingDiscount -= discountShare;
    const netLineTotal = Math.max(0, lineTotal - discountShare);
    const unitPriceNet = netLineTotal / quantity;
    return {
      ...item,
      unit_price: unitPriceNet,
    };
  });
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
    case "category-sales": {
      const items = tableRows
        .map((row) => ({
          label: row[0] ?? "",
          total: parseMoney(row[1]),
          percent: row[4] ?? undefined,
        }))
        .filter((entry) => entry.label && entry.total > 0)
        .slice(0, 12);
      if (!items.length) return null;
      const maxValue = items.reduce(
        (max, entry) => Math.max(max, entry.total),
        0
      );
      return {
        type: "payment-bars",
        items,
        maxValue,
        title: "Participación por categoría",
        description:
          "Comparativa horizontal del aporte de cada categoría a las ventas del periodo.",
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
    id: "products-by-target",
    title: "Ventas por producto o grupo",
    description:
      "Consulta ventas de un producto específico o de un grupo/categoría en un rango de fechas. En exportación Excel se incluye la columna 'Costo producto'.",
    scope: "Productos",
    highlights: ["SKU", "Documento", "POS", "Grupo"],
  },
  ...(SHOW_FREE_SALE_TRACEABILITY_REPORT
    ? [
        {
          id: "free-sales-traceability",
          title: "Trazabilidad venta libre",
          description:
            "Listado de ventas libres con fecha, motivo registrado, precio y número de ticket.",
          scope: "Productos",
          highlights: ["Motivo", "Precio", "Ticket"],
        } satisfies ReportPreset,
      ]
    : []),
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
  const from = buildBogotaDateFromKey(meta.fromDate);
  const to = buildBogotaDateFromKey(meta.toDate);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setUTCMilliseconds(-1);

  return salesData.filter((sale) => {
    const saleStatus = (sale.status ?? "").toLowerCase().trim();
    if (saleStatus === "voided" || !!sale.voided_at) return false;

    const saleDate = parseDateInput(sale.created_at);
    if (!saleDate) return false;
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
    if (preset.id === "month-daily") return MONTH_DAILY_ROWS_PER_PAGE;
    if (
      preset.id === "products-by-target" &&
      meta.productReportResultMode === "grouped"
    ) {
      return PRODUCTS_GROUPED_ROWS_PER_PAGE;
    }
    return TABLE_ROWS_PER_PAGE;
  })();
  const chartConfig = getChartConfig(preset.id, tableRows);
  const columnLayouts = tableColumns.map((column) =>
    getColumnPresentation(preset.id, column)
  );
  const documentTitle = getReportDocumentTitle(preset, meta);
  const emptyMessage =
    result.table?.emptyMessage ??
    "No hay información disponible con los filtros aplicados.";
  const rowChunks = buildRowChunks(preset.id, tableRows, rowsPerPage, meta);
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
  const paperWidth = `${PAPER_WIDTH_MM}mm`;
  const paperHeight = `${PAPER_HEIGHT_MM}mm`;
  const pageMargin = `${PAGE_MARGIN_MM}mm`;
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
              <div>${formatBogotaDate(new Date(), {
                dateStyle: "short",
                timeStyle: "short",
              })}</div>
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
            <div><span>Fuente:</span> ${
              meta.sourceFilter === "metrik"
                ? "Metrik"
                : meta.sourceFilter === "aronium"
                ? "Aronium"
                : "Ambas"
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
        return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#cbd5e1" stroke-width="1" />
        <text x="${left - 14}" y="${y + 4}" fill="#475569" font-size="13" text-anchor="end">${formatMoney(
          value
        )}</text>`;
      })
      .join("");
    let lastValueLabelX = -Infinity;
    let lastValueLabelY = -Infinity;
    const pointElements = points
      .map((point, idx) => {
        const ratio = safeMax > 0 ? point.value / safeMax : 0;
        const x =
          left + (points.length > 1 ? idx * xStep : innerWidth / 2);
        const y = top + innerHeight - ratio * innerHeight;
        const labelY = height - bottom + 50;
        let valueLabelY = y <= top + 26 ? y + 24 : y - 14;
        if (
          Math.abs(x - lastValueLabelX) < 52 &&
          Math.abs(valueLabelY - lastValueLabelY) < 24
        ) {
          valueLabelY = valueLabelY - 18;
        }
        if (valueLabelY < top + 12) {
          valueLabelY = y + 24;
        }
        const chartDayLabel = point.label;
        lastValueLabelX = x;
        lastValueLabelY = valueLabelY;
        return `<circle cx="${x}" cy="${y}" r="7" fill="#1d9fe3" stroke="#ffffff" stroke-width="3" />
        <text x="${x}" y="${valueLabelY}" fill="#111827" font-size="12" font-weight="600" text-anchor="middle">${formatMoney(
          point.value
        )}</text>
        <text x="${x}" y="${labelY}" fill="#475569" font-size="12" text-anchor="end" transform="rotate(-38 ${x} ${labelY})">${chartDayLabel}</text>`;
      })
      .join("");
    chartContent = `<div class="line-chart">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:${height}px;display:block;">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom + 10}" stroke="#94a3b8" stroke-width="2" />
        <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${
          height - bottom
        }" stroke="#94a3b8" stroke-width="2" />
        ${tickLines}
        <polyline points="${polylinePoints}" fill="none" stroke="#10b981" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />
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
              <div>${formatBogotaDate(new Date(), {
                dateStyle: "short",
                timeStyle: "short",
              })}</div>
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
            <div><span>Fuente:</span> ${
              meta.sourceFilter === "metrik"
                ? "Metrik"
                : meta.sourceFilter === "aronium"
                ? "Aronium"
                : "Ambas"
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
          @page { size: ${paperWidth} ${paperHeight}; margin: ${pageMargin}; }
          @page chart-landscape { size: A4 landscape; margin: ${pageMargin}; }
          * { box-sizing: border-box; font-family: "Inter", Arial, sans-serif; }
          body { background: #f4f6f9; color: #0f172a; margin: 0; padding: 24px 0; }
          @media print {
            body { padding: 0; background: #fff; }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .report-wrapper {
              margin: 0 auto !important;
              border: 0 !important;
              /* En impresion priorizamos estabilidad: evita desbordes y paginas fantasma. */
              min-height: calc(${pageHeight} - 2mm) !important;
              height: auto !important;
              display: block !important;
              position: relative !important;
              padding-bottom: 28px !important;
              page-break-after: always !important;
              break-after: page !important;
            }
            .chart-wrapper.landscape {
              min-height: calc(${pageWidth} - 2mm) !important;
            }
            .page-body { display: block !important; flex: 0 0 auto !important; }
            .table-block {
              display: block !important;
              flex: 0 0 auto !important;
              overflow: visible !important;
            }
            .footer {
              margin-top: 0 !important;
              position: absolute !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }
          }
          .report-wrapper { width: ${pageWidth}; min-height: ${pageHeight}; margin: 0 auto 12mm; background: #fff; border: 1px solid #d3d7df; page-break-after: always; break-after: page; display:flex; flex-direction:column; }
          .report-wrapper:last-of-type { page-break-after: auto; break-after: auto; }
          .chart-wrapper { width: ${pageWidth}; }
          .chart-wrapper.landscape { width: ${pageHeight}; min-height: ${pageWidth}; page: chart-landscape; }
          .chart-body { flex:1; display:flex; flex-direction:column; padding: 16px 20px 18px; }
          .page-body { flex:1; display:flex; flex-direction:column; }
          header { padding: 12px 18px 10px; border-bottom: 1px solid #e3e6ef; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 3px; }
          header .left { display: flex; gap: 10px; align-items: center; }
          header .title { font-size: 15px; font-weight: 600; line-height: 1.1; }
          .logo { height: 36px; width: auto; object-fit: contain; }
          header .right { text-align:right;font-size:11px;color:#475569; }
          .meta { padding: 8px 18px; background: #f8fafc; border-bottom: 1px solid #e3e6ef; display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 6px; font-size: 9.5px; line-height: 1.15; }
          .meta span { font-weight: 600; color: #0f172a; }
          .summary { padding: 6px 18px; display: grid; grid-template-columns: repeat(auto-fit,minmax(138px,1fr)); gap: 5px; }
          .card { border: 1px solid #e3e6ef; border-radius: 10px; padding: 5px 8px; background: #fff; break-inside: avoid; min-height: 42px; display:flex; flex-direction:column; justify-content:center; }
          .card .label { font-size: 8.5px; text-transform: uppercase; color: #475569; margin-bottom: 1px; }
          .card .value { font-size: 13px; font-weight: 600; line-height: 1.05; }
          .table-block { flex: 1 1 auto; min-height: 0; padding: 0 18px 10px; display:flex; flex-direction:column; overflow:hidden; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
          th, td { border: 1px solid #d7dbe5; padding: 5px 8px; vertical-align: middle; line-height: 1.2; }
          th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #475569; }
          tr:nth-child(even) { background: #fdfdfd; }
          tr { break-inside: avoid; }
          .note { margin: 10px 20px 4px; font-size: 10px; color: #475569; }
          .footer { border-top: 1px solid #e3e6ef; padding: 8px 20px; font-size: 9px; display: flex; justify-content: space-between; color: #64748b; margin-top: auto; }
          .components { font-size: 10px; margin: 2px 20px 8px; color: #475569; }
          .empty { padding: 10px; text-align: center; color: #94a3b8; font-size: 11px; }
          .align-left { text-align: left; }
          .align-right { text-align: right; }
          .align-center { text-align: center; }
          .nowrap { white-space: nowrap; }
          .numeric { font-variant-numeric: tabular-nums; }
          .date-cell { font-size: 11px; }
          .chart-meta { padding: 8px 0 4px; display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 8px; font-size: 10px; border-bottom: 1px solid #e3e6ef; margin-bottom: 8px; }
          .chart-meta span { font-weight: 600; color: #0f172a; }
          .chart-title { font-size: 16px; font-weight: 600; margin: 12px 0 4px; }
          .chart-description { font-size: 11px; color: #475569; margin-bottom: 12px; }
          .chart-area { flex:1; border:1px solid #d7dbe5; border-radius: 18px; background:#f8fafc; padding: 20px 16px 12px; display:flex; align-items:flex-end; gap: 8px; }
          .chart-bar { flex:1; min-width: 28px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; text-align:center; font-size: 10px; color:#475569; }
          .chart-bar .bar { width: 26px; background: #059669; border: 1px solid #047857; border-radius: 0; }
          .chart-value { font-size: 11px; font-weight: 600; margin-bottom: 4px; color:#0f172a; display:inline-block; transform:rotate(-32deg); transform-origin:left bottom; }
          .chart-label { font-size: 10px; font-weight: 600; margin-top: 6px; color:#0f172a; }
          .chart-subtext { font-size: 9px; color:#94a3b8; margin-top: 1px; }
          .line-chart { flex:1; min-height: 440px; border:1px solid #d7dbe5; border-radius: 18px; background:#fff; padding: 12px 8px; }
          .chart-wrapper.landscape .line-chart { min-height: 440px; }
          .line-svg { width: 100%; height: 100%; display:block; }
          .line-grid { stroke: #e2e8f0; stroke-width: 1; }
          .line-axis { stroke: #94a3b8; stroke-width: 1.2; }
          .line-path { fill: none; stroke: #10b981; stroke-width: 2.5; }
          .line-point { fill: #0ea5e9; stroke: #fff; stroke-width: 1.5; }
          .line-value { font-size: 10px; fill: #0f172a; text-anchor: middle; }
          .line-x-label { font-size: 8px; fill: #475569; text-anchor: middle; }
          .line-y-label { font-size: 9px; fill: #475569; text-anchor: end; }
          .payment-bars { display:flex; flex-direction:column; gap:10px; padding:12px 0; }
          .payment-row { display:grid; grid-template-columns: 130px 1fr 90px; gap:12px; align-items:center; font-size:11px; color:#0f172a; }
          .payment-label { font-weight:600; color:#0f172a; }
          .payment-bar-track { background:#e2e8f0; border-radius:999px; height:14px; overflow:hidden; }
          .payment-bar-fill { background:linear-gradient(90deg,#34d399,#059669); height:100%; border-radius:999px; }
          .payment-value { font-weight:600; text-align:right; font-size:12px; }
          .surcharge-line { margin: 2px 20px; font-size: 10px; color: #0f172a; }
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
  labelResolver?: PaymentLabelResolver,
  changesData: ReportChange[] = [],
  filterMeta?: FilterMeta,
  productGroupById?: Map<number, string>,
  productGroupBySku?: Map<string, string>,
  consolidatedDailySeries?: DashboardDailySalesPoint[]
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
  const consolidatedDailyMap = new Map<string, { total: number; tickets: number }>();
  let consolidatedRangeTotal = 0;
  let consolidatedRangeTickets = 0;
  (consolidatedDailySeries ?? []).forEach((point) => {
    const key = point.date.slice(0, 10);
    if (!key) return;
    const entry = consolidatedDailyMap.get(key) ?? { total: 0, tickets: 0 };
    entry.total += Number(point.total ?? 0);
    entry.tickets += Math.max(0, Math.trunc(Number(point.tickets ?? 0)));
    consolidatedDailyMap.set(key, entry);
    consolidatedRangeTotal += Number(point.total ?? 0);
    consolidatedRangeTickets += Math.max(0, Math.trunc(Number(point.tickets ?? 0)));
  });
  const hasConsolidatedDailySeries = consolidatedDailyMap.size > 0;

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

  const aggregateByPaymentMethod = () => {
    const methodMap = new Map<string, { total: number; count: number }>();
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
      const payments = Array.isArray(sale.payments) ? sale.payments : [];
      const paymentEntries = payments
        .map((payment) => ({
          method:
            payment.method ??
            sale.initial_payment_method ??
            sale.payment_method ??
            "Sin método",
          amount: Math.max(Number(payment.amount ?? 0), 0),
        }))
        .filter((entry) => entry.amount > 0);

      if (sale.is_separated) {
        const collectedFromPayments = paymentEntries.reduce(
          (sum, payment) => sum + payment.amount,
          0
        );
        const fallbackCollected = Math.max(
          Number(
            sale.initial_payment_amount ?? sale.paid_amount ?? 0
          ),
          0
        );
        const collectedAmount =
          collectedFromPayments > 0 ? collectedFromPayments : fallbackCollected;

        if (paymentEntries.length > 0) {
          paymentEntries.forEach((payment) => {
            combineSale(payment.method, payment.amount);
          });
        } else if (collectedAmount > 0) {
          combineSale(
            sale.initial_payment_method ?? sale.payment_method ?? "Sin método",
            collectedAmount
          );
        }
        return;
      }

      if (paymentEntries.length > 1) {
        const sumPayments = paymentEntries.reduce(
          (sum, payment) => sum + payment.amount,
          0
        );
        const saleTotal = sale.total ?? sale.paid_amount ?? sumPayments;
        paymentEntries.forEach((payment) => {
          const value =
            sumPayments > 0
              ? (payment.amount / sumPayments) * saleTotal
              : saleTotal / paymentEntries.length;
          combineSale(payment.method, value);
        });
      } else {
        combineSale(
          sale.payment_method ??
            paymentEntries[0]?.method ??
            sale.initial_payment_method ??
            "Sin método",
          sale.total ?? sale.paid_amount ?? paymentEntries[0]?.amount ?? 0
        );
      }
    });

    return Array.from(methodMap.entries()).sort((a, b) => b[1].total - a[1].total);
  };

const dayFormatter = (iso: string) => {
  const keyMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (keyMatch) {
    const date = buildBogotaDateFromKey(iso);
    return formatBogotaDate(date, { day: "2-digit", month: "short" }) || "--";
  }
  return formatBogotaDate(iso, { day: "2-digit", month: "short" }) || "--";
};

const dateTimeFormatter = (iso: string) =>
  formatBogotaDate(iso, { dateStyle: "short", timeStyle: "short" }) || "--";

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
          {
            label: "Ventas netas",
            value: formatMoney(
              hasConsolidatedDailySeries ? consolidatedRangeTotal : totalNet
            ),
          },
          {
            label: "Tickets",
            value: String(
              hasConsolidatedDailySeries ? consolidatedRangeTickets : ticketCount
            ),
          },
          {
            label: "Ticket promedio",
            value: formatMoney(
              hasConsolidatedDailySeries && consolidatedRangeTickets > 0
                ? consolidatedRangeTotal / consolidatedRangeTickets
                : avgTicket
            ),
          },
        ],
        table: {
          columns: ["POS", "Ventas", "Tickets", "Ticket promedio"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "month-daily": {
      const dayEntries = hasConsolidatedDailySeries
        ? Array.from(consolidatedDailyMap.entries()).map(([date, entry]) => ({
            date,
            total: entry.total,
            tickets: entry.tickets,
          }))
        : (() => {
            const fallbackMap = new Map<string, { total: number; tickets: number }>();
            sales.forEach((sale) => {
              const key = sale.created_at.slice(0, 10);
              if (!fallbackMap.has(key)) {
                fallbackMap.set(key, { total: 0, tickets: 0 });
              }
              const entry = fallbackMap.get(key)!;
              entry.total += sale.total ?? 0;
              entry.tickets += 1;
            });
            return Array.from(fallbackMap.entries()).map(([date, entry]) => ({
              date,
              total: entry.total,
              tickets: entry.tickets,
            }));
          })();
      const rows = dayEntries
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((entry) => [
          dayFormatter(entry.date),
          formatMoney(entry.total),
          String(entry.tickets),
          formatMoney(entry.tickets ? entry.total / entry.tickets : 0),
        ]);
      const monthTotal = dayEntries.reduce((sum, entry) => sum + entry.total, 0);
      const monthTickets = dayEntries.reduce((sum, entry) => sum + entry.tickets, 0);
      return {
        summary: [
          {
            label: "Ventas del periodo",
            value: formatMoney(hasConsolidatedDailySeries ? monthTotal : totalNet),
          },
          {
            label: "Tickets",
            value: String(hasConsolidatedDailySeries ? monthTickets : ticketCount),
          },
          {
            label: "Ticket promedio",
            value: formatMoney(
              hasConsolidatedDailySeries && monthTickets > 0
                ? monthTotal / monthTickets
                : avgTicket
            ),
          },
        ],
        table: {
          columns: ["Día", "Ventas", "Tickets", "Ticket promedio"],
          rows,
        },
        surchargeTotal: totalSurcharge,
      };
    }
    case "category-sales": {
      const categorySalesMode = filterMeta?.categorySalesMode ?? "full";
      const categoryMap = new Map<
        string,
        { total: number; units: number; tickets: Set<number> }
      >();
      const changeMap = new Map<number, ReportChange[]>();
      if (changesData.length > 0) {
        changesData.forEach((change) => {
          if (change.status !== "confirmed" || change.voided_at) return;
          const list = changeMap.get(change.sale_id) ?? [];
          list.push(change);
          changeMap.set(change.sale_id, list);
        });
      }

      sales.forEach((sale) => {
        const changedItems = applyChangesToSaleItems(sale, changeMap.get(sale.id));
        const netItems = applyReturnsToSaleItems(sale, changedItems);
        const pricedItems = applyCartDiscountToItems(sale, netItems);
        pricedItems.forEach((item) => {
          if (isFreeSaleItem(item)) return;
          const skuKey = normalizeComparableText(item.product_sku ?? "");
          const categoryFromCatalogById =
            typeof item.product_id === "number"
              ? productGroupById?.get(item.product_id)?.trim() ?? ""
              : "";
          const categoryFromCatalogBySku =
            skuKey ? productGroupBySku?.get(skuKey)?.trim() ?? "" : "";
          const categoryFromSale =
            item.product_group?.trim() || item.product_category?.trim() || "";
          const category =
            categoryFromCatalogById ||
            categoryFromCatalogBySku ||
            categoryFromSale ||
            "Sin categoría";
          const normalizedPath = category
            .replace(/\s*\/\s*/g, "/")
            .replace(/\s*>\s*/g, "/");
          const categoryParts = normalizedPath
            .split("/")
            .map((part) => part.trim())
            .filter(Boolean);
          const categoryKey =
            categorySalesMode === "main"
              ? categoryParts[0] || "Sin categoría"
              : category;
          const quantity = Math.max(0, Number(item.quantity ?? 0));
          const unitPrice = Math.max(0, Number(item.unit_price ?? 0));
          const lineTotal = unitPrice * quantity;
          if (!categoryMap.has(categoryKey)) {
            categoryMap.set(categoryKey, { total: 0, units: 0, tickets: new Set() });
          }
          const entry = categoryMap.get(categoryKey)!;
          entry.total += lineTotal;
          entry.units += quantity;
          entry.tickets.add(sale.id);
        });
      });

      const categoryRows = Array.from(categoryMap.entries()).sort(
        (a, b) => b[1].total - a[1].total
      );
      const categorizedTotal = categoryRows.reduce(
        (sum, [, entry]) => sum + entry.total,
        0
      );
      const totalUnits = categoryRows.reduce(
        (sum, [, entry]) => sum + entry.units,
        0
      );
      const rows = categoryRows.map(([category, entry]) => {
        const ticketsCount = entry.tickets.size;
        return [
          category,
          formatMoney(entry.total),
          entry.units.toString(),
          ticketsCount.toString(),
          categorizedTotal > 0
            ? `${((entry.total / categorizedTotal) * 100).toFixed(1)}%`
            : "0%",
          formatMoney(ticketsCount > 0 ? entry.total / ticketsCount : 0),
        ];
      });

      return {
        summary: [
          { label: "Categorías activas", value: categoryRows.length.toString() },
          { label: "Unidades", value: totalUnits.toString() },
          { label: "Ventas categorizadas", value: formatMoney(categorizedTotal) },
        ],
        table: {
          columns: [
            "Categoría",
            "Ventas",
            "Unidades",
            "Tickets",
            "Participación",
            "Ticket promedio",
          ],
          rows,
          emptyMessage:
            "No hay productos categorizados para el rango seleccionado.",
        },
        note:
          categorySalesMode === "main"
            ? "Agrupado por categoría principal."
            : "Agrupado por categoría completa (grupo/subgrupo).",
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
        const { hour: hourPart } = getBogotaDateParts(sale.created_at);
        const hourValue = Number(hourPart);
        if (!Number.isFinite(hourValue)) return;
        const hourKey = hourValue;
        minHour = Math.min(minHour, hourKey);
        maxHour = Math.max(maxHour, hourKey);
        if (!hoursMap.has(hourKey)) {
          hoursMap.set(hourKey, { total: 0, count: 0 });
        }
        const entry = hoursMap.get(hourKey)!;
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
      const aggregatedRows = aggregateByPaymentMethod();
      const collectedTotal = aggregatedRows.reduce(
        (sum, [, entry]) => sum + entry.total,
        0
      );
      const separatedPendingTotal = sales.reduce((sum, sale) => {
        if (!sale.is_separated) return sum;
        const collectedFromPayments = (Array.isArray(sale.payments)
          ? sale.payments
          : []
        ).reduce(
          (paymentSum, payment) =>
            paymentSum + Math.max(Number(payment.amount ?? 0), 0),
          0
        );
        const collectedAmount = Math.max(
          collectedFromPayments,
          Number(sale.initial_payment_amount ?? sale.paid_amount ?? 0)
        );
        const totalAmount = Math.max(Number(sale.total ?? 0), 0);
        const pendingAmount = sale.balance != null
          ? Math.max(Number(sale.balance ?? 0), 0)
          : Math.max(totalAmount - collectedAmount, 0);
        return sum + pendingAmount;
      }, 0);
      const separatedPendingTickets = sales.reduce((count, sale) => {
        if (!sale.is_separated) return count;
        const collectedFromPayments = (Array.isArray(sale.payments)
          ? sale.payments
          : []
        ).reduce(
          (paymentSum, payment) =>
            paymentSum + Math.max(Number(payment.amount ?? 0), 0),
          0
        );
        const collectedAmount = Math.max(
          collectedFromPayments,
          Number(sale.initial_payment_amount ?? sale.paid_amount ?? 0)
        );
        const totalAmount = Math.max(Number(sale.total ?? 0), 0);
        const pendingAmount = sale.balance != null
          ? Math.max(Number(sale.balance ?? 0), 0)
          : Math.max(totalAmount - collectedAmount, 0);
        return pendingAmount > 0 ? count + 1 : count;
      }, 0);
      const rows = aggregatedRows
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
            collectedTotal > 0
              ? `${((entry.total / collectedTotal) * 100).toFixed(1)}%`
              : "0%",
          ];
        });
      if (separatedPendingTotal > 0) {
        rows.push([
          "Separados pendientes",
          formatMoney(separatedPendingTotal),
          separatedPendingTickets.toString(),
          "—",
        ]);
      }
      const dominant = rows[0]?.[0] ?? "—";
      return {
        summary: [
          { label: "Métodos activos", value: aggregatedRows.length.toString() },
          { label: "Ventas cobradas", value: formatMoney(collectedTotal) },
          { label: "Método dominante", value: dominant },
          ...(separatedPendingTotal > 0
            ? [
                {
                  label: "Separados pendientes",
                  value: formatMoney(separatedPendingTotal),
                },
              ]
            : []),
        ],
        table: {
          columns: ["Método", "Ventas", "Tickets", "Participación"],
          rows,
        },
        surchargeTotal: totalSurcharge,
        note:
          separatedPendingTotal > 0
            ? "Los separados pendientes se muestran aparte para no inflar los métodos de pago. Solo los abonos registrados se consideran dinero cobrado en el período."
            : undefined,
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
          formatBogotaDate(entry.last, { dateStyle: "short" }),
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
      const rows = aggregateByPaymentMethod()
        .map(([method, entry]) => {
          const resolvedLabel =
            method === "Sin método"
              ? "Sin método"
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
      const productsTopSort = filterMeta?.productsTopSort ?? "units";
      const productsTopScope = filterMeta?.productsTopScope ?? "global";
      const productsTopCategoryMode =
        filterMeta?.productsTopCategoryMode ?? "group";
      const productsTopCategoryKey = normalizeComparableText(
        filterMeta?.productsTopCategoryKey
      );
      const productsTopCategoryLabel =
        filterMeta?.productsTopCategoryLabel?.trim() ?? "";
      const requestedTopLimit = Number(filterMeta?.productsTopLimit ?? 50);
      const productsTopLimit = Math.min(
        100,
        Math.max(1, Number.isFinite(requestedTopLimit) ? requestedTopLimit : 50)
      );
      const productMap = new Map<
        string,
        {
          name: string;
          sku?: string | null;
          group?: string | null;
          total: number;
          units: number;
          last: string;
        }
      >();
      sales.forEach((sale) => {
        sale.items?.forEach((item) => {
          if (isFreeSaleItem(item)) return;
          const productName = item.product_name ?? item.name ?? "Sin nombre";
          const skuRaw = (item.product_sku ?? "").trim();
          const skuKey = normalizeComparableText(item.product_sku ?? "");
          const key =
            typeof item.product_id === "number"
              ? `id:${item.product_id}`
              : skuRaw
              ? `sku:${skuKey}`
              : `name:${normalizeComparableText(productName)}`;
          const groupFromSale = item.product_group ?? item.product_category ?? null;
          const groupFromId =
            typeof item.product_id === "number"
              ? productGroupById?.get(item.product_id) ?? null
              : null;
          const groupFromSku =
            skuKey.length > 0 ? productGroupBySku?.get(skuKey) ?? null : null;
          // Priorizamos el catálogo maestro (id/sku) sobre el dato embebido en la venta.
          // Esto evita clasificaciones inconsistentes cuando la fuente legacy trae grupo distinto.
          const groupFromCatalog = groupFromId ?? groupFromSku;
          const resolvedGroup = groupFromCatalog ?? groupFromSale;
          if (!productMap.has(key)) {
            productMap.set(key, {
              name: productName,
              sku: item.product_sku ?? null,
              group: resolvedGroup,
              total: 0,
              units: 0,
              last: sale.created_at,
            });
          }
          const entry = productMap.get(key)!;
          entry.total += (item.unit_price ?? 0) * (item.quantity ?? 0);
          entry.units += item.quantity ?? 0;
          if (!entry.sku && item.product_sku) entry.sku = item.product_sku;
          if (groupFromCatalog) {
            entry.group = groupFromCatalog;
          } else if (!entry.group && resolvedGroup) {
            entry.group = resolvedGroup;
          }
          if (sale.created_at > entry.last) entry.last = sale.created_at;
        });
      });
      const entriesArray = Array.from(productMap.values());
      const compareTopEntries = (
        left: { name: string; sku?: string | null; group?: string | null; total: number; units: number; last: string },
        right: { name: string; sku?: string | null; group?: string | null; total: number; units: number; last: string }
      ) => {
        if (productsTopSort === "units") {
          if (right.units !== left.units) return right.units - left.units;
          return right.total - left.total;
        }
        if (right.total !== left.total) return right.total - left.total;
        return right.units - left.units;
      };

      const toGroupSegment = (groupRaw: string | null | undefined) => {
        const normalized = (groupRaw ?? "").trim();
        if (!normalized) return "Sin grupo";
        const compact = normalized.replace(/\s*\/\s*/g, "/").replace(/\s*>\s*/g, ">");
        const parts = compact
          .split(/[\/>]/)
          .map((part) => part.trim())
          .filter(Boolean);
        if (!parts.length) return normalized;
        return productsTopCategoryMode === "subgroup" ? parts[parts.length - 1] : parts[0];
      };
      const toNormalizedSubgroupPath = (groupRaw: string | null | undefined) => {
        const raw = (groupRaw ?? "").trim();
        if (!raw) return "";
        const normalized = raw.replace(/\s*\/\s*/g, "/").replace(/\s*>\s*/g, "/");
        return normalizeComparableText(normalized);
      };

      const selectedEntries =
        productsTopScope === "category"
          ? (() => {
              const filteredByCategory = entriesArray.filter((entryTuple) => {
                if (!productsTopCategoryKey) return true;
                if (productsTopCategoryMode === "subgroup") {
                  return (
                    toNormalizedSubgroupPath(entryTuple.group) ===
                    productsTopCategoryKey
                  );
                }
                return (
                  normalizeComparableText(toGroupSegment(entryTuple.group)) ===
                  productsTopCategoryKey
                );
              });
              const sorted = filteredByCategory.sort(compareTopEntries);
              return sorted.slice(0, productsTopLimit);
            })()
          : entriesArray.sort(compareTopEntries).slice(0, productsTopLimit);

      const rows = selectedEntries.map((entry) => [
        entry.sku ?? "—",
        entry.name,
        getLastGroupSegment(entry.group),
        entry.units.toString(),
        formatMoney(entry.total),
        dateTimeFormatter(entry.last),
      ]);
      const rankingUnits = selectedEntries.reduce(
        (sum, entry) => sum + entry.units,
        0
      );
      const rankingValue = selectedEntries.reduce(
        (sum, entry) => sum + entry.total,
        0
      );
      return {
        summary: [
          { label: "Productos únicos", value: selectedEntries.length.toString() },
          { label: "Filas en ranking", value: rows.length.toString() },
          { label: "Unidades vendidas", value: rankingUnits.toString() },
          {
            label: "Valor generado",
            value: formatMoney(rankingValue),
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
        note:
          [
            productsTopSort === "units"
              ? "Ordenado por unidades vendidas."
              : "Ordenado por valor vendido.",
            productsTopScope === "category"
              ? `Top ${productsTopLimit} para ${
                  productsTopCategoryLabel ||
                  (productsTopCategoryMode === "subgroup"
                    ? "subcategoría / subgrupo"
                    : "grupo / categoría")
                } (${productsTopCategoryMode === "subgroup" ? "subgrupo final" : "grupo principal"}).`
              : `Top ${productsTopLimit} global.`,
          ].join(" "),
        surchargeTotal: totalSurcharge,
      };
    }
    case "products-sold": {
      const rows: Array<Array<string>> = [];
      let units = 0;
      let subtotal = 0;
      const uniqueProducts = new Set<string>();
      const changeMap = new Map<number, ReportChange[]>();
      if (changesData.length > 0) {
        changesData.forEach((change) => {
          if (change.status !== "confirmed" || change.voided_at) return;
          const list = changeMap.get(change.sale_id) ?? [];
          list.push(change);
          changeMap.set(change.sale_id, list);
        });
      }
      sales.forEach((sale) => {
        const changedItems = applyChangesToSaleItems(sale, changeMap.get(sale.id));
        const netItems = applyReturnsToSaleItems(sale, changedItems);
        const pricedItems = applyCartDiscountToItems(sale, netItems);
        pricedItems.forEach((item) => {
          const productName =
            item.product_name ?? item.name ?? "Producto sin nombre";
          uniqueProducts.add(productName);
          const quantity = item.quantity ?? 0;
          const unitPrice = item.unit_price ?? 0;
          const lineTotal = unitPrice * quantity;
          units += quantity;
          subtotal += lineTotal;
          rows.push([
            dateFormatter(sale.created_at),
            productName,
            item.product_sku ?? "—",
            formatMoney(unitPrice),
            quantity.toString(),
            formatMoney(lineTotal),
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
            "Total línea",
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
    case "products-by-target": {
      const mode = filterMeta?.productReportMode;
      const resultMode =
        filterMeta?.productReportResultMode ??
        (mode === "group" ? "grouped" : "detailed");
      const targetProductId = filterMeta?.productReportProductId ?? null;
      const targetGroupPath = normalizeText(filterMeta?.productReportGroupPath);
      const targetGroupName = normalizeText(filterMeta?.productReportGroupName);
      const lastSaleByProductId = filterMeta?.productReportLastSaleByProductId ?? {};
      const rows: Array<Array<string>> = [];
      let units = 0;
      let totalValue = 0;
      let documents = 0;
      const groupedMap = new Map<
        string,
        {
          productId: number | null;
          sku: string;
          product: string;
          group: string;
          units: number;
          total: number;
          documents: Set<number>;
          lastSaleAt: string | null;
        }
      >();

      const changeMap = new Map<number, ReportChange[]>();
      if (changesData.length > 0) {
        changesData.forEach((change) => {
          if (change.status !== "confirmed" || change.voided_at) return;
          const list = changeMap.get(change.sale_id) ?? [];
          list.push(change);
          changeMap.set(change.sale_id, list);
        });
      }

      sales.forEach((sale) => {
        let saleMatched = false;
        const isImportedLegacySale =
          typeof sale.document_number === "string" &&
          sale.document_number.toUpperCase().startsWith("ARO-");
        const changedItems = applyChangesToSaleItems(sale, changeMap.get(sale.id));
        const netItems = applyReturnsToSaleItems(sale, changedItems);
        const pricedItems = applyCartDiscountToItems(sale, netItems);
        pricedItems.forEach((item) => {
          const quantity = Number(item.quantity ?? 0);
          if (!Number.isFinite(quantity) || quantity <= 0) return;
          const resolvedGroupFromCatalogById =
            !isImportedLegacySale && item.product_id != null
              ? productGroupById?.get(item.product_id) ?? ""
              : "";
          const skuKey = normalizeComparableText(item.product_sku ?? "");
          const resolvedGroupFromCatalogBySku =
            skuKey && productGroupBySku ? productGroupBySku.get(skuKey) ?? "" : "";
          const resolvedGroupFromCatalog =
            resolvedGroupFromCatalogById || resolvedGroupFromCatalogBySku;
          const legacyGroupRaw = item.product_group ?? item.product_category ?? "";
          const legacyGroupForMatch = normalizeText(legacyGroupRaw);
          const itemGroupForMatch = normalizeText(
            resolvedGroupFromCatalog || legacyGroupRaw
          );
          const byPath =
            !!targetGroupPath &&
            (itemGroupForMatch === targetGroupPath ||
              itemGroupForMatch.startsWith(`${targetGroupPath}/`));
          const byName =
            !!targetGroupName &&
            (itemGroupForMatch === targetGroupName ||
              itemGroupForMatch.endsWith(`/${targetGroupName}`));
          const matchesProduct =
            mode === "product"
              ? targetProductId != null && item.product_id === targetProductId
              : true;
          const matchesGroup =
            mode === "group"
              ? !!itemGroupForMatch && (byPath || byName)
              : true;
          if (!matchesProduct || !matchesGroup) return;

          const unitPrice = Number(item.unit_price ?? 0);
          const lineTotal = Math.max(0, unitPrice * quantity);
          const itemGroupRaw =
            resolvedGroupFromCatalog ||
            legacyGroupRaw ||
            (legacyGroupForMatch ? legacyGroupRaw : "") ||
            "";
          if (resultMode === "detailed") {
            rows.push([
              item.product_sku ?? "—",
              item.product_name ?? item.name ?? "Producto sin nombre",
              formatMoney(unitPrice),
              dateFormatter(sale.created_at),
              sale.document_number
                ? sale.document_number
                : sale.sale_number
                ? `#${sale.sale_number.toString().padStart(4, "0")}`
                : "—",
              quantity.toString(),
              itemGroupRaw || "Sin grupo",
              sale.pos_name ?? "Sin POS",
            ]);
          } else {
            const key =
              item.product_id != null
                ? `id:${item.product_id}`
                : `${item.product_sku ?? ""}|${item.product_name ?? item.name ?? ""}`;
            if (!groupedMap.has(key)) {
              groupedMap.set(key, {
                sku: item.product_sku ?? "—",
                product: item.product_name ?? item.name ?? "Producto sin nombre",
                group: itemGroupRaw || "Sin grupo",
                productId: item.product_id ?? null,
                units: 0,
                total: 0,
                documents: new Set<number>(),
                lastSaleAt: null,
              });
            }
            const entry = groupedMap.get(key)!;
            entry.units += quantity;
            entry.total += lineTotal;
            entry.documents.add(sale.id);
            if (
              !entry.lastSaleAt ||
              new Date(sale.created_at).getTime() > new Date(entry.lastSaleAt).getTime()
            ) {
              entry.lastSaleAt = sale.created_at;
            }
          }
          units += quantity;
          totalValue += lineTotal;
          saleMatched = true;
        });
        if (saleMatched) documents += 1;
      });

      if (resultMode === "grouped") {
        rows.push(
          ...Array.from(groupedMap.values())
            .sort((a, b) => {
              const aBackendLast =
                a.productId != null
                  ? lastSaleByProductId[String(a.productId)] || null
                  : null;
              const bBackendLast =
                b.productId != null
                  ? lastSaleByProductId[String(b.productId)] || null
                  : null;
              const aLast = aBackendLast || a.lastSaleAt || "";
              const bLast = bBackendLast || b.lastSaleAt || "";
              const byLastSale =
                new Date(bLast).getTime() - new Date(aLast).getTime();
              if (Number.isFinite(byLastSale) && byLastSale !== 0) {
                return byLastSale;
              }
              return b.total - a.total;
            })
            .map((entry) => [
              entry.sku,
              entry.product,
              entry.group,
              entry.units.toString(),
              formatMoney(entry.units > 0 ? entry.total / entry.units : 0),
              formatMoney(entry.total),
              entry.productId != null &&
              typeof lastSaleByProductId[String(entry.productId)] === "string"
                ? dateTimeFormatter(lastSaleByProductId[String(entry.productId)])
                : entry.lastSaleAt
                ? dateTimeFormatter(entry.lastSaleAt)
                : "—",
            ])
        );
      } else {
        rows.sort((a, b) => {
          const aUnits = Number(a[5] || 0);
          const bUnits = Number(b[5] || 0);
          if (bUnits !== aUnits) return bUnits - aUnits;
          const aPrice = toNumber(a[2] || "0");
          const bPrice = toNumber(b[2] || "0");
          return bPrice - aPrice;
        });
      }

      return {
        summary: [
          { label: "Filas encontradas", value: rows.length.toString() },
          { label: "Unidades", value: units.toString() },
          { label: "Valor total", value: formatMoney(totalValue) },
          { label: "Documentos", value: documents.toString() },
        ],
        table: {
          columns:
            resultMode === "grouped"
              ? [
                  "SKU",
                  "Producto",
                  "Grupo",
                  "Unidades",
                  "Valor unidad",
                  "Valor total",
                  "Última venta",
                ]
              : [
                  "SKU",
                  "Producto",
                  "Precio",
                  "Fecha",
                  "Documento",
                  "Unidades",
                  "Grupo",
                  "POS",
                ],
          rows,
          emptyMessage: "No hay ventas para el producto/grupo seleccionado en este rango.",
        },
        note:
          mode === "product"
            ? `Filtro aplicado por producto: ${filterMeta?.productReportProductName || "seleccionado"}.`
            : `Filtro aplicado por grupo/categoría: ${filterMeta?.productReportGroupName || "seleccionado"}.`,
        surchargeTotal: totalSurcharge,
      };
    }
    case "free-sales-traceability": {
      const rows: Array<Array<string>> = [];
      let freeSaleCount = 0;
      let freeSaleValue = 0;

      sales.forEach((sale) => {
        const reasons = extractFreeSaleReasonsFromNotes(sale.notes);
        const freeItems = (sale.items ?? []).filter((item) => isFreeSaleItem(item));
        if (!freeItems.length) return;
        freeItems.forEach((item, index) => {
          const quantity = Math.max(0, Number(item.quantity ?? 0));
          const unitPrice = Math.max(0, Number(item.unit_price ?? 0));
          const lineTotal = unitPrice * quantity;
          freeSaleCount += 1;
          freeSaleValue += lineTotal;
          rows.push([
            dateTimeFormatter(sale.created_at),
            reasons[index] ?? reasons[0] ?? "Sin motivo registrado",
            formatMoney(unitPrice),
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
          { label: "Ventas libres", value: freeSaleCount.toString() },
          { label: "Valor total", value: formatMoney(freeSaleValue) },
          {
            label: "Motivos registrados",
            value: rows.filter((row) => row[1] !== "Sin motivo registrado").length.toString(),
          },
        ],
        table: {
          columns: ["Fecha", "Motivo", "Precio", "Ticket"],
          rows,
          emptyMessage:
            "No se registraron ventas libres en este periodo.",
        },
        note:
          "Este informe muestra cada línea de venta libre y el motivo capturado al momento de la venta.",
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
  changesData: ReportChange[];
  consolidatedDailySeries: DashboardDailySalesPoint[];
  resultOverride?: ReportResult | null;
  companyInfo: CompanyInfo;
  token?: string | null;
  settingsError?: string | null;
  onClose?: () => void;
  resolveMethodLabel: PaymentLabelResolver;
  productGroupById?: Map<number, string>;
  productGroupBySku?: Map<string, string>;
};

const dateFormatter = (iso: string) =>
  formatBogotaDate(iso, { dateStyle: "short" }) || "--";

const buildItemKey = (item: {
  product_id?: number | null;
  product_name?: string | null;
  product_sku?: string | null;
}) => {
  if (item.product_id != null) return `id:${item.product_id}`;
  const name = item.product_name ?? "";
  const sku = item.product_sku ?? "";
  return `name:${name}|sku:${sku}`;
};

const applyChangesToSaleItems = (
  sale: ReportSale,
  changes: ReportChange[] | undefined
): ReportSaleItem[] => {
  const sourceItems = sale.items ?? [];
  if (!sourceItems.length || !changes || changes.length === 0) {
    return sourceItems;
  }

  const itemsMap = new Map<string, ReportSaleItem>();
  sourceItems.forEach((item) => {
    const key = buildItemKey(item);
    const quantity = Number(item.quantity ?? 0);
    if (quantity <= 0) return;
    itemsMap.set(key, { ...item });
  });

  changes.forEach((change) => {
    if (change.status !== "confirmed" || change.voided_at) return;
    change.items_returned?.forEach((item) => {
      const key = buildItemKey(item);
      const existing = itemsMap.get(key);
      const quantity = Number(item.quantity ?? 0);
      if (existing) {
        const nextQty = Number(existing.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          existing.quantity = nextQty;
          itemsMap.set(key, existing);
        } else {
          itemsMap.delete(key);
        }
        return;
      }
      const fallbackKey = buildItemKey({
        product_name: item.product_name ?? undefined,
        product_sku: item.product_sku ?? undefined,
      });
      const fallback = itemsMap.get(fallbackKey);
      if (fallback) {
        const nextQty = Number(fallback.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          fallback.quantity = nextQty;
          itemsMap.set(fallbackKey, fallback);
        } else {
          itemsMap.delete(fallbackKey);
        }
      }
    });

    change.items_new?.forEach((item) => {
      const key = buildItemKey(item);
      const existing = itemsMap.get(key);
      const quantity = Number(item.quantity ?? 0);
      if (existing) {
        existing.quantity = Number(existing.quantity ?? 0) + quantity;
        if (existing.unit_price == null) {
          existing.unit_price = item.unit_price;
        }
        if (!existing.product_name) {
          existing.product_name = item.product_name ?? undefined;
        }
        if (!existing.product_sku) {
          existing.product_sku = item.product_sku ?? undefined;
        }
        itemsMap.set(key, existing);
        return;
      }
      itemsMap.set(key, {
        product_id: item.product_id,
        product_name: item.product_name ?? undefined,
        product_sku: item.product_sku ?? undefined,
        quantity,
        unit_price: item.unit_price,
      });
    });
  });

  return Array.from(itemsMap.values()).filter(
    (item) => Number(item.quantity ?? 0) > 0
  );
};

const applyReturnsToSaleItems = (sale: ReportSale, items: ReportSaleItem[]) => {
  if (!items.length) return items;
  const returns = sale.returns ?? [];
  if (!returns.length) return items;

  const itemsMap = new Map<string, ReportSaleItem>();
  items.forEach((item) => {
    const key = buildItemKey(item);
    const quantity = Number(item.quantity ?? 0);
    if (quantity <= 0) return;
    itemsMap.set(key, { ...item });
  });

  returns.forEach((ret) => {
    if (ret.status && ret.status !== "confirmed") return;
    if (ret.voided_at) return;
    ret.items?.forEach((returnedItem) => {
      const key = buildItemKey(returnedItem);
      const existing = itemsMap.get(key);
      const quantity = Number(returnedItem.quantity ?? 0);
      if (quantity <= 0) return;
      if (existing) {
        const nextQty = Number(existing.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          existing.quantity = nextQty;
          itemsMap.set(key, existing);
        } else {
          itemsMap.delete(key);
        }
        return;
      }
      const fallbackKey = buildItemKey({
        product_name: returnedItem.product_name ?? undefined,
        product_sku: returnedItem.product_sku ?? undefined,
      });
      const fallback = itemsMap.get(fallbackKey);
      if (fallback) {
        const nextQty = Number(fallback.quantity ?? 0) - quantity;
        if (nextQty > 0) {
          fallback.quantity = nextQty;
          itemsMap.set(fallbackKey, fallback);
        } else {
          itemsMap.delete(fallbackKey);
        }
      }
    });
  });

  return Array.from(itemsMap.values()).filter(
    (item) => Number(item.quantity ?? 0) > 0
  );
};

function ReportDocumentViewer({
  preset,
  filterMeta,
  salesData,
  changesData,
  consolidatedDailySeries,
  resultOverride,
  companyInfo,
  token,
  settingsError,
  onClose,
  resolveMethodLabel,
  productGroupById,
  productGroupBySku,
}: ReportDocumentViewerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filteredSales = useMemo(
    () => filterSalesByMeta(salesData, filterMeta),
    [salesData, filterMeta]
  );

  const result = useMemo(
    () =>
      resultOverride ??
      buildReportResult(
        preset.id,
        filteredSales,
        resolveMethodLabel,
        changesData,
        filterMeta,
        productGroupById,
        productGroupBySku,
        consolidatedDailySeries
      ),
    [
      resultOverride,
      preset.id,
      filteredSales,
      resolveMethodLabel,
      changesData,
      filterMeta,
      productGroupById,
      productGroupBySku,
      consolidatedDailySeries,
    ]
  );
  const documentData = useMemo(() => {
    const tableRows = result?.table?.rows ?? [];
    const rowsPerPage = (() => {
      if (preset.id === "hourly-sales") return 16;
      if (preset.id === "month-daily") return MONTH_DAILY_ROWS_PER_PAGE;
      if (
        preset.id === "products-by-target" &&
        filterMeta.productReportResultMode === "grouped"
      ) {
        return PRODUCTS_GROUPED_ROWS_PER_PAGE;
      }
      return TABLE_ROWS_PER_PAGE;
    })();
    const chartConfig = getChartConfig(preset.id, tableRows);
    const rowChunks = buildRowChunks(
      preset.id,
      tableRows,
      rowsPerPage,
      filterMeta
    );
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
  }, [filterMeta, result, pageIndex, preset.id]);

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

  const handleDownloadPdf = useCallback(async () => {
    if (!result) return;
    try {
      setExportLoading(true);
      setExportError(null);

      const documentTitle = getReportDocumentTitle(preset, filterMeta);
      const html = buildDocumentHtml(
        preset,
        result,
        companyInfo,
        filterMeta,
        resolveMethodLabel
      );
      const blob = await exportReportPdf(
        {
          title: documentTitle,
          document_html: html,
          preset_id: preset.id,
        },
        token
      );

      const fileName = `reporte_${preset.id}_${filterMeta.fromDate}_${filterMeta.toDate}.pdf`;
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options?: {
            suggestedName?: string;
            types?: {
              description?: string;
              accept?: Record<string, string[]>;
            }[];
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
            suggestedName: fileName,
            types: [
              {
                description: "PDF",
                accept: {
                  "application/pdf": [".pdf"],
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
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "No se pudo exportar el archivo PDF."
      );
    } finally {
      setExportLoading(false);
    }
  }, [
    result,
    preset,
    companyInfo,
    filterMeta,
    resolveMethodLabel,
    token,
  ]);

  const handleDownloadExcel = useCallback(async () => {
    if (!result) return;
    try {
      setExportLoading(true);
      setExportError(null);

      let excelColumns = result.table?.columns ?? [];
      let excelRows = result.table?.rows ?? [];
      if (preset.id === "products-by-target") {
        const unitsColumnIndex = excelColumns.findIndex(
          (column) => normalizeComparableText(column) === "unidades"
        );
        if (unitsColumnIndex >= 0) {
          const costColumnIndex = unitsColumnIndex + 1;
          const costBySku = filterMeta.productReportCostBySku ?? {};
          excelColumns = [
            ...excelColumns.slice(0, costColumnIndex),
            "Costo producto",
            ...excelColumns.slice(costColumnIndex),
          ];
          excelRows = excelRows.map((row) => {
            const sku = row[0] ?? "";
            const skuKey = normalizeComparableText(sku);
            const costValue = costBySku[skuKey];
            const costCell =
              typeof costValue === "number" && Number.isFinite(costValue)
                ? formatMoney(costValue)
                : "—";
            return [
              ...row.slice(0, costColumnIndex),
              costCell,
              ...row.slice(costColumnIndex),
            ];
          });
        }
      }

      const blob = await exportReportExcel(
        {
          preset_id: preset.id,
          title: preset.title,
          company: {
            name: companyInfo.name,
            address: companyInfo.address,
            email: companyInfo.email,
            phone: companyInfo.phone,
          },
          filters: {
            from_date: filterMeta.fromDate,
            to_date: filterMeta.toDate,
            pos_filter: filterMeta.posFilter,
            method_filter: filterMeta.methodFilter,
            seller_filter: filterMeta.sellerFilter,
          },
          summary: result.summary.map((item) => ({
            label: item.label,
            value: item.value,
          })),
          table: {
            columns: excelColumns,
            rows: excelRows,
            empty_message: result.table?.emptyMessage,
          },
        },
        token
      );

      const fileName = `reporte_${preset.id}_${filterMeta.fromDate}_${filterMeta.toDate}.xlsx`;
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options?: {
            suggestedName?: string;
            types?: {
              description?: string;
              accept?: Record<string, string[]>;
            }[];
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
            suggestedName: fileName,
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
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "No se pudo exportar el archivo Excel."
      );
    } finally {
      setExportLoading(false);
    }
  }, [result, preset, companyInfo, filterMeta, token]);

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
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleDownloadPdf}
            disabled={exportLoading}
          >
            {exportLoading ? "Generando PDF..." : "Descargar PDF"}
          </button>
          <button
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleDownloadExcel}
            disabled={exportLoading}
          >
            {exportLoading ? "Generando Excel..." : "Descargar Excel"}
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
      {exportError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-100 px-4 py-3">
          {exportError}
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
  const { token, user } = useAuth();
  const reportStorageScope = useMemo(() => {
    const email =
      typeof user?.email === "string"
        ? user.email.trim().toLowerCase()
        : "";
    if (email) return email;
    if (typeof user?.id === "number") return `u${user.id}`;
    return "anon";
  }, [user?.email, user?.id]);
  const favoritesStorageKey = useMemo(
    () => buildReportStorageKey(reportStorageScope, "favorites"),
    [reportStorageScope]
  );
  const openReportsStorageKey = useMemo(
    () => buildReportStorageKey(reportStorageScope, "open_tabs"),
    [reportStorageScope]
  );
  const activeReportTabStorageKey = useMemo(
    () => buildReportStorageKey(reportStorageScope, "active_tab"),
    [reportStorageScope]
  );
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
  const [range, setRange] = useState<QuickRange>("today");
  const [fromDate, setFromDate] = useState<string>(defaultDates.fromDate);
  const [toDate, setToDate] = useState<string>(defaultDates.toDate);
  const [posFilter, setPosFilter] = useState<string>("todos");
  const [sellerFilter, setSellerFilter] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [sourceFilter, setSourceFilter] = useState<"all" | "metrik" | "aronium">(
    "all"
  );
  const [productReportModalOpen, setProductReportModalOpen] = useState(false);
  const [productReportMode, setProductReportMode] = useState<"product" | "group">(
    "product"
  );
  const [productReportResultMode, setProductReportResultMode] = useState<
    "detailed" | "grouped"
  >("detailed");
  const [productReportFromDate, setProductReportFromDate] = useState("");
  const [productReportToDate, setProductReportToDate] = useState("");
  const [productReportDateError, setProductReportDateError] = useState<string | null>(
    null
  );
  const [productsTopSortModalOpen, setProductsTopSortModalOpen] = useState(false);
  const [productsTopSortChoice, setProductsTopSortChoice] = useState<"value" | "units">("units");
  const [productsTopLimitChoice, setProductsTopLimitChoice] = useState<10 | 20 | 50 | 100>(
    50
  );
  const [productsTopScopeChoice, setProductsTopScopeChoice] = useState<
    "global" | "category"
  >("global");
  const [productsTopCategoryModeChoice, setProductsTopCategoryModeChoice] = useState<
    "group" | "subgroup"
  >("group");
  const [productsTopCategoryKeyChoice, setProductsTopCategoryKeyChoice] = useState("");
  const [categorySalesModalOpen, setCategorySalesModalOpen] = useState(false);
  const [categorySalesModeChoice, setCategorySalesModeChoice] = useState<
    "full" | "main"
  >("full");
  const [productQuery, setProductQuery] = useState("");
  const [productOptions, setProductOptions] = useState<ProductSearchOption[]>([]);
  const [productSearchResults, setProductSearchResults] = useState<ProductSearchOption[]>(
    []
  );
  const [selectedReportProduct, setSelectedReportProduct] =
    useState<ProductSearchOption | null>(null);
  const [groupOptions, setGroupOptions] = useState<ProductGroupOption[]>([]);
  const [selectedGroupPath, setSelectedGroupPath] = useState("");
  const [productLookupLoading, setProductLookupLoading] = useState(false);
  const [productLookupError, setProductLookupError] = useState<string | null>(null);
  const mergedGroupOptions = useMemo(() => {
    const map = new Map<string, ProductGroupOption>();
    let syntheticId = -1;

    for (const group of groupOptions) {
      const key = group.path.trim();
      if (!key) continue;
      map.set(key, group);
    }

    for (const product of productOptions) {
      const raw = product.groupName.trim();
      if (!raw) continue;
      if (!map.has(raw)) {
        map.set(raw, {
          id: syntheticId--,
          path: raw,
          displayName: raw,
          parentPath: null,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.path.localeCompare(b.path, "es", { sensitivity: "base" })
    );
  }, [groupOptions, productOptions]);
  const productsTopCategoryOptions = useMemo(() => {
    const uniqueRoots = new Map<string, string>();
    mergedGroupOptions.forEach((group) => {
      const path = (group.path ?? "").trim();
      if (!path) return;
      const normalized = path.replace(/\s*\/\s*/g, "/").replace(/\s*>\s*/g, "/");
      const parts = normalized
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
      if (!parts.length) return;
      const root = parts[0];
      const rootKey = normalizeComparableText(root);
      if (!rootKey || uniqueRoots.has(rootKey)) return;
      uniqueRoots.set(rootKey, root);
    });
    return Array.from(uniqueRoots.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [mergedGroupOptions]);
  const productsTopSubcategoryOptions = useMemo(() => {
    const uniquePaths = new Map<string, string>();
    mergedGroupOptions.forEach((group) => {
      const path = (group.path ?? "").trim();
      if (!path) return;
      const normalized = path.replace(/\s*\/\s*/g, "/").replace(/\s*>\s*/g, "/");
      const key = normalizeComparableText(normalized);
      if (!key || uniquePaths.has(key)) return;
      uniquePaths.set(key, normalized);
    });
    return Array.from(uniquePaths.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [mergedGroupOptions]);
  const paymentOptions = useMemo(
    () =>
      [...catalog]
        .filter((method) => method.is_active)
        .sort((a, b) => a.order_index - b.order_index),
    [catalog]
  );
  const productGroupById = useMemo(() => {
    const map = new Map<number, string>();
    productOptions.forEach((product) => {
      if (product.id != null && product.groupName.trim()) {
        map.set(product.id, product.groupName.trim());
      }
    });
    return map;
  }, [productOptions]);
  const productGroupBySku = useMemo(() => {
    const map = new Map<string, string>();
    productOptions.forEach((product) => {
      const skuKey = normalizeComparableText(product.sku ?? "");
      const groupName = product.groupName.trim();
      if (skuKey && groupName) {
        map.set(skuKey, groupName);
      }
    });
    return map;
  }, [productOptions]);

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [openReports, setOpenReports] = useState<OpenReportTab[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(
        buildReportStorageKey("anon", "open_tabs")
      );
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
      buildReportStorageKey("anon", "active_tab")
    );
    return stored || "selector";
  });

  const [salesData, setSalesData] = useState<ReportSale[]>([]);
  const [changesData, setChangesData] = useState<ReportChange[]>([]);
  const [consolidatedDailySeries, setConsolidatedDailySeries] = useState<
    DashboardDailySalesPoint[]
  >([]);
  const salesDataRef = useRef<ReportSale[]>([]);
  const changesDataRef = useRef<ReportChange[]>([]);
  const consolidatedDailySeriesRef = useRef<DashboardDailySalesPoint[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const salesLoadedRef = useRef(false);
  const lastLoadedSalesSignatureRef = useRef("");
  const [favoriteReportIds, setFavoriteReportIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(
        buildReportStorageKey("anon", "favorites")
      );
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
  const storageScopeInitializedRef = useRef<string | null>(null);
  const favoritesSyncReadyRef = useRef(false);
  const lastFavoritesSyncSignatureRef = useRef<string>("");
  const favoritesVersionRef = useRef<string>("");

  const [posSettings, setPosSettings] = useState<PosSettingsPayload | null>(
    null
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [roleModules, setRoleModules] = useState<RolePermissionModule[]>(
    defaultRolePermissions
  );

  const filterMeta: FilterMeta = useMemo(
    () => ({
      fromDate,
      toDate,
      posFilter,
      methodFilter,
      sellerFilter,
      sourceFilter,
    }),
    [fromDate, toDate, posFilter, methodFilter, sellerFilter, sourceFilter]
  );
  const canLoadRolePermissions = useMemo(() => {
    if (!isDashboardRole(user?.role)) return false;
    const settingsModule = defaultRolePermissions.find(
      (row) => row.id === "settings"
    );
    const settingsAction = settingsModule?.actions.find(
      (entry) => entry.id === "settings.view"
    );
    if (!settingsAction) return false;
    return Boolean(settingsAction.roles[user.role]);
  }, [user?.role]);
  const canSeeModuleAction = useCallback(
    (moduleId: string, actionId: string) => {
      if (!isDashboardRole(user?.role)) return false;
      const permissionModule = roleModules.find((row) => row.id === moduleId);
      if (!permissionModule) return false;
      const action = permissionModule.actions.find(
        (entry) => entry.id === actionId
      );
      if (!action) return Boolean(permissionModule.roles[user.role]);
      return Boolean(action.roles[user.role]);
    },
    [roleModules, user?.role]
  );
  const canViewOperationalSales = canSeeModuleAction("pos", "pos.sales");
  const canViewReportDataset =
    canSeeModuleAction("reports", "reports.view") ||
    canSeeModuleAction("sales_history", "sales_history.view") ||
    canViewOperationalSales;
  const canViewPosSettings = canSeeModuleAction("settings", "settings.view");

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

  useEffect(() => {
    salesDataRef.current = salesData;
  }, [salesData]);

  useEffect(() => {
    changesDataRef.current = changesData;
  }, [changesData]);

  useEffect(() => {
    consolidatedDailySeriesRef.current = consolidatedDailySeries;
  }, [consolidatedDailySeries]);

  useEffect(() => {
    if (!token) return;
    if (!canLoadRolePermissions) {
      setRoleModules(defaultRolePermissions);
      return;
    }
    let cancelled = false;
    fetchRolePermissions(token)
      .then((modules) => {
        if (!cancelled) {
          setRoleModules(modules);
        }
      })
      .catch((err) => {
        console.error("No pudimos cargar permisos de reportes.", err);
        if (!cancelled) {
          setRoleModules(defaultRolePermissions);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadRolePermissions, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        favoritesStorageKey,
        JSON.stringify(favoriteReportIds)
      );
    } catch (err) {
      console.warn("No se pudieron guardar favoritos", err);
    }
  }, [favoriteReportIds, favoritesStorageKey]);

  const sanitizeFavoriteIds = useCallback((ids: string[]): string[] => {
    const validPresetIds = new Set(REPORT_PRESETS.map((preset) => preset.id));
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const rawId of ids) {
      const id = rawId.trim();
      if (!id || seen.has(id) || !validPresetIds.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    return unique;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (storageScopeInitializedRef.current === reportStorageScope) return;
    storageScopeInitializedRef.current = reportStorageScope;

    const anonOpenKey = buildReportStorageKey("anon", "open_tabs");
    const anonActiveKey = buildReportStorageKey("anon", "active_tab");
    const anonFavoritesKey = buildReportStorageKey("anon", "favorites");

    try {
      const scopedOpenRaw = window.localStorage.getItem(openReportsStorageKey);
      const fallbackOpenRaw =
        reportStorageScope !== "anon" && !scopedOpenRaw
          ? window.localStorage.getItem(anonOpenKey)
          : null;
      const parsedOpen = JSON.parse(scopedOpenRaw ?? fallbackOpenRaw ?? "[]");
      if (Array.isArray(parsedOpen)) {
        setOpenReports(parsedOpen.filter(isValidOpenReportTab));
      } else {
        setOpenReports([]);
      }
    } catch {
      setOpenReports([]);
    }

    const scopedActive =
      window.localStorage.getItem(activeReportTabStorageKey) ??
      (reportStorageScope !== "anon"
        ? window.localStorage.getItem(anonActiveKey)
        : null);
    setActiveTabId(scopedActive || "selector");

    try {
      const scopedFavoritesRaw = window.localStorage.getItem(favoritesStorageKey);
      const anonFavoritesRaw =
        reportStorageScope !== "anon"
          ? window.localStorage.getItem(anonFavoritesKey)
          : null;
      const scopedParsed = JSON.parse(scopedFavoritesRaw ?? "[]");
      const anonParsed = JSON.parse(anonFavoritesRaw ?? "[]");
      const scopedFavorites = Array.isArray(scopedParsed)
        ? sanitizeFavoriteIds(
            scopedParsed.filter(
              (id: unknown): id is string => typeof id === "string"
            )
          )
        : [];
      const anonFavorites = Array.isArray(anonParsed)
        ? sanitizeFavoriteIds(
            anonParsed.filter(
              (id: unknown): id is string => typeof id === "string"
            )
          )
        : [];

      // If user-scoped storage is empty (common after auth scope changes),
      // recover favorites previously saved under anon and merge.
      const mergedFavorites =
        reportStorageScope !== "anon" && scopedFavorites.length === 0
          ? sanitizeFavoriteIds([...anonFavorites, ...scopedFavorites])
          : scopedFavorites;

      setFavoriteReportIds(mergedFavorites);
    } catch {
      setFavoriteReportIds([]);
    }
  }, [
    reportStorageScope,
    openReportsStorageKey,
    activeReportTabStorageKey,
    favoritesStorageKey,
    sanitizeFavoriteIds,
  ]);

  const readLocalFavoriteIds = useCallback((): string[] => {
    if (typeof window === "undefined") return [];
    try {
      const scopedRaw = window.localStorage.getItem(favoritesStorageKey);
      const scopedParsed = JSON.parse(scopedRaw ?? "[]");
      const scopedFavorites = Array.isArray(scopedParsed)
        ? sanitizeFavoriteIds(
            scopedParsed.filter(
              (id: unknown): id is string => typeof id === "string"
            )
          )
        : [];

      if (reportStorageScope === "anon") {
        return scopedFavorites;
      }

      const anonRaw = window.localStorage.getItem(
        buildReportStorageKey("anon", "favorites")
      );
      const anonParsed = JSON.parse(anonRaw ?? "[]");
      const anonFavorites = Array.isArray(anonParsed)
        ? sanitizeFavoriteIds(
            anonParsed.filter(
              (id: unknown): id is string => typeof id === "string"
            )
          )
        : [];

      if (scopedFavorites.length === 0 && anonFavorites.length > 0) {
        return sanitizeFavoriteIds([...anonFavorites, ...scopedFavorites]);
      }
      return scopedFavorites;
    } catch (err) {
      console.warn("No se pudieron leer favoritos locales", err);
      return [];
    }
  }, [favoritesStorageKey, reportStorageScope, sanitizeFavoriteIds]);

  useEffect(() => {
    favoritesSyncReadyRef.current = false;
    if (!token) {
      lastFavoritesSyncSignatureRef.current = "";
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const remoteState = await fetchReportFavorites(token);
        favoritesVersionRef.current = remoteState.version ?? "";
        const remoteFavorites = sanitizeFavoriteIds(remoteState.preset_ids);
        const localFavorites = readLocalFavoriteIds();
        const mergedFavorites = sanitizeFavoriteIds([
          ...remoteFavorites,
          ...localFavorites,
        ]);

        let nextFavorites = mergedFavorites;
        if (!areSameStringArrays(mergedFavorites, remoteFavorites)) {
          const savedState = await saveReportFavorites(
            mergedFavorites,
            favoritesVersionRef.current,
            token
          );
          favoritesVersionRef.current = savedState.version ?? "";
          nextFavorites = sanitizeFavoriteIds(savedState.preset_ids);
        }

        if (cancelled) return;
        const normalizedNext = sanitizeFavoriteIds(nextFavorites);
        lastFavoritesSyncSignatureRef.current = JSON.stringify(normalizedNext);
        setFavoriteReportIds((prev) =>
          areSameStringArrays(prev, normalizedNext) ? prev : normalizedNext
        );
      } catch (err) {
        console.error("No se pudieron cargar los favoritos del usuario", err);
        const localFavorites = readLocalFavoriteIds();
        lastFavoritesSyncSignatureRef.current = JSON.stringify(localFavorites);
        setFavoriteReportIds((prev) =>
          areSameStringArrays(prev, localFavorites) ? prev : localFavorites
        );
      } finally {
        if (!cancelled) {
          favoritesSyncReadyRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readLocalFavoriteIds, sanitizeFavoriteIds, token]);

  useEffect(() => {
    if (!token || !favoritesSyncReadyRef.current) return;
    const normalized = sanitizeFavoriteIds(favoriteReportIds);
    const nextSignature = JSON.stringify(normalized);
    if (nextSignature === lastFavoritesSyncSignatureRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const savedState = await saveReportFavorites(
          normalized,
          favoritesVersionRef.current,
          token
        );
        if (cancelled) return;
        favoritesVersionRef.current = savedState.version ?? "";
        const saved = sanitizeFavoriteIds(savedState.preset_ids);
        const savedSignature = JSON.stringify(saved);
        lastFavoritesSyncSignatureRef.current = savedSignature;
        setFavoriteReportIds((prev) =>
          areSameStringArrays(prev, saved) ? prev : saved
        );
      } catch (err) {
        if (err instanceof ReportFavoritesConflictError) {
          try {
            const remoteState = await fetchReportFavorites(token);
            if (cancelled) return;
            favoritesVersionRef.current = remoteState.version ?? "";
            const remoteFavorites = sanitizeFavoriteIds(remoteState.preset_ids);
            const merged = sanitizeFavoriteIds([...remoteFavorites, ...normalized]);
            const mergedSavedState = await saveReportFavorites(
              merged,
              favoritesVersionRef.current,
              token
            );
            if (cancelled) return;
            favoritesVersionRef.current = mergedSavedState.version ?? "";
            const mergedSaved = sanitizeFavoriteIds(mergedSavedState.preset_ids);
            const mergedSignature = JSON.stringify(mergedSaved);
            lastFavoritesSyncSignatureRef.current = mergedSignature;
            setFavoriteReportIds((prev) =>
              areSameStringArrays(prev, mergedSaved) ? prev : mergedSaved
            );
            return;
          } catch (conflictRetryErr) {
            console.error(
              "No se pudo resolver el conflicto de favoritos",
              conflictRetryErr
            );
          }
        } else {
          console.error("No se pudieron sincronizar los favoritos", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [favoriteReportIds, sanitizeFavoriteIds, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (openReports.length) {
        window.localStorage.setItem(
          openReportsStorageKey,
          JSON.stringify(openReports)
        );
      } else {
        window.localStorage.removeItem(openReportsStorageKey);
      }
    } catch (err) {
      console.warn("No se pudieron guardar las pestañas de reportes", err);
    }
  }, [openReports, openReportsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeTabId && activeTabId !== "selector") {
        window.localStorage.setItem(
          activeReportTabStorageKey,
          activeTabId
        );
      } else {
        window.localStorage.removeItem(activeReportTabStorageKey);
      }
    } catch (err) {
      console.warn("No se pudo guardar la pestaña activa de reportes", err);
    }
  }, [activeTabId, activeReportTabStorageKey]);

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

  const handleQuickRange = (value: QuickRange) => {
    const todayKey = getBogotaDateKey();
    const todayStart = buildBogotaDateFromKey(todayKey);
    let startKey = todayKey;
    let endKey = todayKey;
    switch (value) {
      case "today":
        break;
      case "yesterday":
        startKey = getBogotaDateKey(
          new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
        );
        endKey = startKey;
        break;
      case "week":
        startKey = getBogotaDateKey(
          new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
        );
        break;
      case "month":
        {
          const { year, month } = getBogotaDateParts();
          startKey = `${year}-${month}-01`;
        }
        break;
      case "previous_month":
        {
          const today = buildBogotaDateFromKey(todayKey);
          const prevMonthAnchor = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 15, 12, 0, 0)
          );
          const { year, month } = getBogotaDateParts(prevMonthAnchor);
          startKey = `${year}-${month}-01`;
          const monthEnd = new Date(
            Date.UTC(Number(year), Number(month), 0, 12, 0, 0)
          );
          const { day } = getBogotaDateParts(monthEnd);
          endKey = `${year}-${month}-${day}`;
        }
        break;
      case "year":
        {
          const { year } = getBogotaDateParts();
          startKey = `${year}-01-01`;
        }
        break;
      default:
        break;
    }
    setRange(value);
    setFromDate(startKey);
    setToDate(endKey);
  };

  const loadSales = useCallback(async () => {
    const requestSignature = `${fromDate}|${toDate}|${sourceFilter}`;
    if (!canViewReportDataset) {
      salesLoadedRef.current = false;
      lastLoadedSalesSignatureRef.current = "";
      setSalesData([]);
      setChangesData([]);
      salesDataRef.current = [];
      changesDataRef.current = [];
      setSalesError(null);
      setSalesLoading(false);
      return;
    }
    if (!authHeaders) return;
    try {
      setSalesLoading(true);
      setSalesError(null);
      const apiBase = getApiBase();
      const limitWarnings: string[] = [];

      const fetchAllPages = async <T,>(
        path: string,
        extraParams?: Record<string, string>,
        options?: { maxRows?: number; timeoutMs?: number }
      ): Promise<T[]> => {
        const rows: T[] = [];
        let skip = 0;
        for (;;) {
          const params = new URLSearchParams({
            skip: String(skip),
            limit: String(REPORT_PAGE_SIZE),
            ...(extraParams ?? {}),
          });
          const controller = new AbortController();
          const timeoutId = window.setTimeout(
            () => controller.abort(),
            options?.timeoutMs ?? REPORT_FETCH_TIMEOUT_MS
          );
          const res = await fetch(`${apiBase}${path}?${params.toString()}`, {
            headers: authHeaders,
            credentials: "include",
            signal: controller.signal,
          }).finally(() => {
            window.clearTimeout(timeoutId);
          });
          if (!res.ok) {
            throw new Error(`Error ${res.status}`);
          }
          const page: T[] = await res.json();
          rows.push(...page);
          if (options?.maxRows && rows.length > options.maxRows) {
            rows.length = options.maxRows;
            limitWarnings.push(
              "El rango consultado es demasiado grande para cargarlo completo. Mostramos una vista parcial; reduce fechas o usa modo agrupado."
            );
            break;
          }
          if (page.length < REPORT_PAGE_SIZE) break;
          skip += page.length;
        }
        return rows;
      };

      const [salesResult, changesResult, consolidatedDailyResult] =
        await Promise.allSettled([
        fetchAllPages<ReportSale>(
          "/pos/sales",
          {
            source: sourceFilter,
            include_adjustments: "true",
            ...buildBogotaRangeApiParams(fromDate, toDate),
          },
          {
            maxRows: REPORT_MAX_SALES_ROWS,
            timeoutMs:
              sourceFilter === "all"
                ? REPORT_FETCH_TIMEOUT_SALES_ALL_MS
                : REPORT_FETCH_TIMEOUT_MS,
          }
        ),
        fetchAllPages<ReportChange>(
          "/pos/changes",
          buildBogotaRangeApiParams(fromDate, toDate),
          {
            maxRows: REPORT_MAX_CHANGES_ROWS,
            timeoutMs: REPORT_FETCH_TIMEOUT_MS,
          }
        ),
        (async (): Promise<DashboardDailySalesPoint[]> => {
          const params = new URLSearchParams({
            ...buildBogotaRangeApiParams(fromDate, toDate),
            source: sourceFilter,
          });
          const controller = new AbortController();
          const timeoutId = window.setTimeout(
            () => controller.abort(),
            REPORT_FETCH_TIMEOUT_MS
          );
          const res = await fetch(
            `${apiBase}/dashboard/daily-sales?${params.toString()}`,
            {
              headers: authHeaders,
              credentials: "include",
              signal: controller.signal,
            }
          ).finally(() => {
            window.clearTimeout(timeoutId);
          });
          if (!res.ok) {
            throw new Error(`Error ${res.status}`);
          }
          return (await res.json()) as DashboardDailySalesPoint[];
        })(),
      ]);

      if (salesResult.status !== "fulfilled") {
        throw salesResult.reason;
      }

      const data = salesResult.value;
      const nextSales = data;

      if (limitWarnings.length > 0) {
        setSalesError(limitWarnings[0]);
      }

      setSalesData(nextSales);
      salesDataRef.current = nextSales;
      salesLoadedRef.current = true;
      lastLoadedSalesSignatureRef.current = requestSignature;
      if (changesResult.status === "fulfilled") {
        setChangesData(changesResult.value);
        changesDataRef.current = changesResult.value;
      } else {
        setChangesData([]);
        changesDataRef.current = [];
      }
      if (consolidatedDailyResult.status === "fulfilled") {
        setConsolidatedDailySeries(consolidatedDailyResult.value);
        consolidatedDailySeriesRef.current = consolidatedDailyResult.value;
      } else {
        setConsolidatedDailySeries([]);
        consolidatedDailySeriesRef.current = [];
      }
    } catch (err) {
      console.error(err);
      salesLoadedRef.current = false;
      lastLoadedSalesSignatureRef.current = "";
      if (err instanceof DOMException && err.name === "AbortError") {
        setSalesError(
          "La consulta tardó demasiado. Reduce el rango de fechas o usa modo agrupado."
        );
        return;
      }
      setSalesError(
        err instanceof Error
          ? err.message
          : "No pudimos cargar la información de ventas."
      );
      setConsolidatedDailySeries([]);
      consolidatedDailySeriesRef.current = [];
    } finally {
      setSalesLoading(false);
    }
  }, [authHeaders, canViewReportDataset, fromDate, sourceFilter, toDate]);

  const ensureSalesLoaded = useCallback(async () => {
    const requestSignature = `${fromDate}|${toDate}|${sourceFilter}`;
    if (
      salesLoadedRef.current &&
      lastLoadedSalesSignatureRef.current === requestSignature
    ) {
      return true;
    }
    await loadSales();
    return salesLoadedRef.current;
  }, [fromDate, sourceFilter, toDate, loadSales]);

  useEffect(() => {
    let active = true;
    if (!token) return;
    if (!canViewPosSettings) {
      setPosSettings(null);
      setSettingsError(null);
      return;
    }
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
  }, [canViewPosSettings, token]);

  const loadProductLookupData = useCallback(async () => {
    if (!authHeaders) return null;
    try {
      setProductLookupLoading(true);
      setProductLookupError(null);
      const apiBase = getApiBase();

      const fetchAllProducts = async (): Promise<ProductSearchOption[]> => {
        const rows: ProductSearchOption[] = [];
        let skip = 0;
        const pageSize = 1000;
        for (;;) {
          const res = await fetch(
            `${apiBase}/products/?skip=${skip}&limit=${pageSize}`,
            {
              headers: authHeaders,
              credentials: "include",
            }
          );
          if (!res.ok) throw new Error(`Error ${res.status}`);
          const batch: Array<{
            id: number;
            name?: string | null;
            sku?: string | null;
            group_name?: string | null;
          }> = await res.json();
          rows.push(
            ...batch
              .filter((item) => typeof item.id === "number")
              .map((item) => ({
                id: item.id,
                name: (item.name ?? "").trim() || "Producto sin nombre",
                sku: (item.sku ?? "").trim(),
                groupName: (item.group_name ?? "").trim(),
              }))
          );
          if (batch.length < pageSize) break;
          skip += batch.length;
        }
        return rows;
      };

      const fetchAllGroups = async (): Promise<ProductGroupOption[]> => {
        const rows: ProductGroupOption[] = [];
        let skip = 0;
        const pageSize = 500;
        for (;;) {
          const res = await fetch(
            `${apiBase}/product-groups/?skip=${skip}&limit=${pageSize}`,
            {
              headers: authHeaders,
              credentials: "include",
            }
          );
          if (!res.ok) throw new Error(`Error ${res.status}`);
          const batch: Array<{
            id: number;
            path: string;
            display_name: string;
            parent_path?: string | null;
          }> =
            await res.json();
          rows.push(
            ...batch
              .filter(
                (item) =>
                  typeof item.id === "number" &&
                  typeof item.path === "string" &&
                  typeof item.display_name === "string"
              )
              .map((item) => ({
                id: item.id,
                path: item.path,
                displayName: item.display_name,
                parentPath: item.parent_path ?? null,
              }))
          );
          if (batch.length < pageSize) break;
          skip += batch.length;
        }
        return rows;
      };

      const [products, groups] = await Promise.all([
        fetchAllProducts(),
        fetchAllGroups(),
      ]);
      setProductOptions(products);
      setGroupOptions(groups);
      return { products, groups };
    } catch (err) {
      console.error("No se pudo cargar catálogo para reporte de productos", err);
      setProductLookupError(
        err instanceof Error ? err.message : "No se pudo cargar catálogo."
      );
      return null;
    } finally {
      setProductLookupLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) {
      setProductSearchResults([]);
      return;
    }
    const results = productOptions
      .filter((product) => {
        const haystack = [
          product.name.toLowerCase(),
          product.sku.toLowerCase(),
          product.groupName.toLowerCase(),
          String(product.id),
        ];
        return haystack.some((value) => value.includes(query));
      })
      .slice(0, 24);
    setProductSearchResults(results);
  }, [productOptions, productQuery]);

  const handleSelectPreset = useCallback((presetId: string) => {
    if (presetId === "month-daily") {
      const { fromDate: monthStart, toDate: monthEnd } = getMonthRangeFromKey(
        getBogotaDateKey()
      );
      setRange("month");
      setFromDate(monthStart);
      setToDate(monthEnd);
    }
    setSelectedPresetId(presetId);
    setActiveTabId("selector");
  }, []);

  const createReportTab = useCallback(
    (
      preset: ReportPreset,
      customMeta?: Partial<FilterMeta>,
      customResultSnapshot?: ReportResult | null
    ) => {
      const tabFilterMeta = { ...filterMeta, ...customMeta };
      const instanceId = `${preset.id}-${Date.now()}`;
      const scopedSales = filterSalesByMeta(salesDataRef.current, tabFilterMeta);
      const resultSnapshot =
        customResultSnapshot ??
        buildReportResult(
          preset.id,
          scopedSales,
          resolveMethodLabel,
          changesDataRef.current,
          tabFilterMeta,
          productGroupById,
          productGroupBySku,
          consolidatedDailySeriesRef.current
        );
      const newTab: OpenReportTab = {
        id: instanceId,
        presetId: preset.id,
        filterMeta: tabFilterMeta,
        createdAt: new Date().toISOString(),
        resultSnapshot: resultSnapshot ?? undefined,
        snapshotSavedAt: resultSnapshot ? new Date().toISOString() : undefined,
      };
      setSelectedPresetId(preset.id);
      setOpenReports((prev) => [...prev, newTab]);
      setActiveTabId(instanceId);
    },
    [filterMeta, resolveMethodLabel, productGroupById, productGroupBySku]
  );

  const openProductTargetModal = useCallback(() => {
    setProductReportFromDate("");
    setProductReportToDate("");
    setProductReportDateError(null);
    setProductReportMode("product");
    setProductReportResultMode("detailed");
    setProductQuery("");
    setSelectedReportProduct(null);
    setSelectedGroupPath("");
    setProductSearchResults([]);
    setProductLookupError(null);
    setProductReportModalOpen(true);
    if (!productOptions.length || !groupOptions.length) {
      void loadProductLookupData();
    }
  }, [productOptions.length, groupOptions.length, loadProductLookupData]);

  const toggleFavorite = useCallback((presetId: string) => {
    setFavoriteReportIds((prev) => {
      const exists = prev.includes(presetId);
      return exists ? prev.filter((id) => id !== presetId) : [...prev, presetId];
    });
  }, []);

  async function handleOpenReport() {
    if (!currentPreset) return;
    if (currentPreset.id === "products-by-target") {
      openProductTargetModal();
      return;
    }
    if (currentPreset.id === "products-sold") {
      void createProductsSoldReportTab(currentPreset);
      return;
    }
    if (currentPreset.id === "products-top") {
      if (!productOptions.length || !groupOptions.length) {
        void loadProductLookupData();
      }
      setProductsTopSortChoice(filterMeta.productsTopSort ?? "units");
      const currentLimit = filterMeta.productsTopLimit;
      setProductsTopLimitChoice(
        currentLimit === 10 || currentLimit === 20 || currentLimit === 50 || currentLimit === 100
          ? currentLimit
          : 50
      );
      setProductsTopScopeChoice(filterMeta.productsTopScope ?? "global");
      setProductsTopCategoryModeChoice(
        filterMeta.productsTopCategoryMode ?? "group"
      );
      setProductsTopCategoryKeyChoice(filterMeta.productsTopCategoryKey ?? "");
      setProductsTopSortModalOpen(true);
      return;
    }
    if (currentPreset.id === "category-sales") {
      setCategorySalesModeChoice(filterMeta.categorySalesMode ?? "full");
      setCategorySalesModalOpen(true);
      return;
    }
    const loaded = await ensureSalesLoaded();
    if (!loaded) return;
    createReportTab(currentPreset);
  }

  async function confirmOpenCategorySalesReport() {
    const preset = REPORT_PRESETS.find((item) => item.id === "category-sales");
    if (!preset) return;
    const loaded = await ensureSalesLoaded();
    if (!loaded) return;

    const lookup =
      productOptions.length > 0 || groupOptions.length > 0
        ? { products: productOptions, groups: groupOptions }
        : await loadProductLookupData();

    const resolvedGroupById = new Map<number, string>();
    const resolvedGroupBySku = new Map<string, string>();
    if (lookup) {
      lookup.products.forEach((product) => {
        const groupName = (product.groupName ?? "").trim();
        if (groupName && typeof product.id === "number") {
          resolvedGroupById.set(product.id, groupName);
        }
        const skuKey = normalizeComparableText(product.sku ?? "");
        if (groupName && skuKey) {
          resolvedGroupBySku.set(skuKey, groupName);
        }
      });
    }

    const customMeta: Partial<FilterMeta> = {
      categorySalesMode: categorySalesModeChoice,
    };
    const tabFilterMeta = { ...filterMeta, ...customMeta };
    const scopedSales = filterSalesByMeta(salesDataRef.current, tabFilterMeta);
    const resultSnapshot = buildReportResult(
      preset.id,
      scopedSales,
      resolveMethodLabel,
      changesDataRef.current,
      tabFilterMeta,
      resolvedGroupById.size > 0 ? resolvedGroupById : productGroupById,
      resolvedGroupBySku.size > 0 ? resolvedGroupBySku : productGroupBySku,
      consolidatedDailySeriesRef.current
    );

    createReportTab(preset, customMeta, resultSnapshot);
    setCategorySalesModalOpen(false);
  }

  async function confirmOpenProductsTopReport() {
    const preset = REPORT_PRESETS.find((item) => item.id === "products-top");
    if (!preset) return;
    const loaded = await ensureSalesLoaded();
    if (!loaded) return;

    const lookup =
      productOptions.length > 0 || groupOptions.length > 0
        ? { products: productOptions, groups: groupOptions }
        : await loadProductLookupData();

    const resolvedGroupById = new Map<number, string>();
    const resolvedGroupBySku = new Map<string, string>();
    if (lookup) {
      lookup.products.forEach((product) => {
        const groupName = (product.groupName ?? "").trim();
        if (groupName && typeof product.id === "number") {
          resolvedGroupById.set(product.id, groupName);
        }
        const skuKey = normalizeComparableText(product.sku ?? "");
        if (groupName && skuKey) {
          resolvedGroupBySku.set(skuKey, groupName);
        }
      });
    }

    const tabFilterMeta = {
      ...filterMeta,
      productsTopSort: productsTopSortChoice,
      productsTopLimit: productsTopLimitChoice,
      productsTopScope: productsTopScopeChoice,
      productsTopCategoryMode: productsTopCategoryModeChoice,
      productsTopCategoryKey:
        productsTopScopeChoice === "category" ? productsTopCategoryKeyChoice : undefined,
      productsTopCategoryLabel:
        productsTopScopeChoice === "category"
          ? productsTopCategoryModeChoice === "subgroup"
            ? productsTopSubcategoryOptions.find(
                (option) => option.key === productsTopCategoryKeyChoice
              )?.label ?? ""
            : productsTopCategoryOptions.find(
                (option) => option.key === productsTopCategoryKeyChoice
              )?.label ?? ""
          : undefined,
    };
    const scopedSales = filterSalesByMeta(salesDataRef.current, tabFilterMeta);
    const resultSnapshot = buildReportResult(
      preset.id,
      scopedSales,
      resolveMethodLabel,
      changesDataRef.current,
      tabFilterMeta,
      resolvedGroupById.size > 0 ? resolvedGroupById : productGroupById,
      resolvedGroupBySku.size > 0 ? resolvedGroupBySku : productGroupBySku,
      consolidatedDailySeriesRef.current
    );

    createReportTab(
      preset,
      {
        productsTopSort: productsTopSortChoice,
        productsTopLimit: productsTopLimitChoice,
        productsTopScope: productsTopScopeChoice,
        productsTopCategoryMode: productsTopCategoryModeChoice,
        productsTopCategoryKey:
          productsTopScopeChoice === "category"
            ? productsTopCategoryKeyChoice
            : undefined,
        productsTopCategoryLabel:
          productsTopScopeChoice === "category"
            ? productsTopCategoryModeChoice === "subgroup"
              ? productsTopSubcategoryOptions.find(
                  (option) => option.key === productsTopCategoryKeyChoice
                )?.label ?? ""
              : productsTopCategoryOptions.find(
                  (option) => option.key === productsTopCategoryKeyChoice
                )?.label ?? ""
            : undefined,
      },
      resultSnapshot
    );
    setProductsTopSortModalOpen(false);
  }

  async function createProductsSoldReportTab(preset: ReportPreset) {
    if (!token) return;
    try {
      setSalesLoading(true);
      setSalesError(null);
      const response = await fetchProductsSoldReport(
        {
          date_from: filterMeta.fromDate,
          date_to: filterMeta.toDate,
          source: filterMeta.sourceFilter ?? sourceFilter,
          pos_filter: filterMeta.posFilter,
          method_filter: filterMeta.methodFilter,
          seller_filter: filterMeta.sellerFilter,
        },
        token
      );
      const snapshot: ReportResult = {
        summary: [
          { label: "Unidades vendidas", value: String(response.units ?? 0) },
          { label: "Productos únicos", value: String(response.unique_products ?? 0) },
          { label: "Valor de productos", value: formatMoney(response.product_value ?? 0) },
          { label: "Separados pendientes", value: formatMoney(response.separated_pending ?? 0) },
          { label: "Valor cobrado asociado", value: formatMoney(response.collected_value ?? 0) },
        ],
        table: {
          columns: [
            "Fecha",
            "Producto",
            "Código / SKU",
            "Precio unitario",
            "Cantidad",
            "Total línea",
            "Ticket",
          ],
          rows: response.rows.map((row) => [
            row.date
              ? formatBogotaDate(row.date, { dateStyle: "short" }) || "—"
              : "—",
            row.product || "Producto sin nombre",
            row.sku || "—",
            formatMoney(row.unit_price ?? 0),
            String(row.quantity ?? 0),
            formatMoney(row.line_total ?? 0),
            row.document || "—",
          ]),
          emptyMessage: "No se registraron productos vendidos en este periodo.",
        },
        note:
          "Incluye cada artículo vendido con el ticket al que pertenece. Los separados pendientes se muestran aparte para diferenciar valor de productos y valor cobrado asociado.",
      };
      createReportTab(preset, undefined, snapshot);
    } catch (err) {
      console.error(err);
      setSalesError(
        err instanceof Error
          ? err.message
          : "No se pudo generar el reporte de productos vendidos."
      );
    } finally {
      setSalesLoading(false);
    }
  }

  const handleFromDateChange = useCallback(
    (value: string) => {
      setRange("custom");
      setFromDate(value);
    },
    []
  );

  const handleToDateChange = useCallback(
    (value: string) => {
      setRange("custom");
      setToDate(value);
    },
    []
  );

  const handleCreateProductTargetReport = useCallback(async () => {
    const preset = REPORT_PRESETS.find((item) => item.id === "products-by-target");
    if (!preset) return;
    if (productReportMode === "product" && !selectedReportProduct) return;
    if (productReportMode === "group" && !selectedGroupPath) return;
    if (!productReportFromDate || !productReportToDate) {
      setProductReportDateError("Debes elegir un rango de tiempo para generar el reporte.");
      return;
    }
    if (productReportFromDate > productReportToDate) {
      setProductReportDateError("La fecha 'Desde' no puede ser mayor que 'Hasta'.");
      return;
    }
    if (productReportResultMode === "detailed") {
      const start = buildBogotaDateFromKey(productReportFromDate);
      const end = buildBogotaDateFromKey(productReportToDate);
      const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      if (diffDays > PRODUCT_DETAILED_MAX_RANGE_DAYS && sourceFilter === "all") {
        setProductReportDateError(
          "Para rangos mayores a 62 días con fuente 'Todos', usa 'Agrupado' o reduce el rango."
        );
        return;
      }
    }
    setProductReportDateError(null);

    const selectedGroup =
      mergedGroupOptions.find((group) => group.path === selectedGroupPath) ?? null;
    const customMeta: Partial<FilterMeta> = {
      fromDate: productReportFromDate,
      toDate: productReportToDate,
      productReportMode,
      productReportProductId:
        productReportMode === "product" ? selectedReportProduct?.id ?? null : null,
      productReportProductName:
        productReportMode === "product"
          ? selectedReportProduct?.name ?? ""
          : undefined,
      productReportProductGroupName:
        productReportMode === "product"
          ? selectedReportProduct?.groupName ?? ""
          : undefined,
      productReportGroupPath:
        productReportMode === "group" ? selectedGroupPath : undefined,
      productReportGroupName:
        productReportMode === "group" ? selectedGroup?.displayName ?? "" : undefined,
      productReportResultMode,
      sourceFilter,
    };

    try {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[products-by-target] payload", {
          date_from: productReportFromDate,
          date_to: productReportToDate,
          source: sourceFilter,
          mode: productReportMode,
          result_mode: productReportResultMode,
          product_id:
            productReportMode === "product" ? selectedReportProduct?.id ?? null : null,
          product_sku:
            productReportMode === "product"
              ? selectedReportProduct?.sku ?? undefined
              : undefined,
          product_name:
            productReportMode === "product"
              ? selectedReportProduct?.name ?? undefined
              : undefined,
          group_path: productReportMode === "group" ? selectedGroupPath : undefined,
          group_name:
            productReportMode === "group"
              ? selectedGroup?.displayName ?? undefined
              : undefined,
        });
      }
      const response = await fetchProductsByTarget(
        {
          date_from: productReportFromDate,
          date_to: productReportToDate,
          source: sourceFilter,
          mode: productReportMode,
          result_mode: productReportResultMode,
          product_id:
            productReportMode === "product" ? selectedReportProduct?.id ?? null : null,
          product_sku:
            productReportMode === "product"
              ? selectedReportProduct?.sku ?? undefined
              : undefined,
          product_name:
            productReportMode === "product"
              ? selectedReportProduct?.name ?? undefined
              : undefined,
          group_path: productReportMode === "group" ? selectedGroupPath : undefined,
          group_name:
            productReportMode === "group"
              ? selectedGroup?.displayName ?? undefined
              : undefined,
        },
        token
      );
      const costBySku: Record<string, number> = {};
      for (const row of response.rows) {
        const skuKey = normalizeComparableText(row.sku ?? "");
        if (!skuKey) continue;
        if (typeof row.product_cost === "number" && Number.isFinite(row.product_cost)) {
          costBySku[skuKey] = row.product_cost;
        }
      }
      customMeta.productReportCostBySku = costBySku;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[products-by-target] response", {
          rows_count: response.rows_count,
          units: response.units,
          total_value: response.total_value,
          documents: response.documents,
          first_rows: response.rows.slice(0, 5),
        });
      }

      const tableColumns =
        productReportResultMode === "grouped"
          ? [
              "SKU",
              "Producto",
              "Grupo",
              "Unidades",
              "Precio actual",
              "Precio promedio vendido",
              "Valor total",
              "Última venta",
            ]
          : [
              "SKU",
              "Producto",
              "Precio",
              "Fecha",
              "Documento",
              "Unidades",
              "Grupo",
              "POS",
            ];

      const tableRows =
        productReportResultMode === "grouped"
          ? response.rows.map((row) => [
              row.sku || "—",
              row.product || "Producto sin nombre",
              row.group || "Sin grupo",
              String(row.units ?? 0),
              formatMoney(row.unit_value ?? 0),
              formatMoney(row.avg_unit_value ?? row.unit_value ?? 0),
              formatMoney(row.total_value ?? 0),
              row.last_sale_at ? formatBogotaDate(row.last_sale_at, { dateStyle: "short", timeStyle: "short" }) || "—" : "—",
            ])
          : response.rows.map((row) => [
              row.sku || "—",
              row.product || "Producto sin nombre",
              formatMoney(row.unit_value ?? 0),
              row.sale_at ? formatBogotaDate(row.sale_at, { dateStyle: "short" }) || "—" : "—",
              row.document || "—",
              String(row.units ?? 0),
              row.group || "Sin grupo",
              row.pos_name || "Sin POS",
            ]);

      const snapshot: ReportResult = {
        summary: [
          { label: "Filas encontradas", value: String(response.rows_count ?? tableRows.length) },
          { label: "Unidades", value: String(response.units ?? 0) },
          { label: "Valor total", value: formatMoney(response.total_value ?? 0) },
          { label: "Documentos", value: String(response.documents ?? 0) },
        ],
        table: {
          columns: tableColumns,
          rows: tableRows,
          emptyMessage: "No hay ventas para el producto/grupo seleccionado en este rango.",
        },
        note:
          productReportMode === "product"
            ? `Filtro aplicado por producto: ${selectedReportProduct?.name || "seleccionado"}.`
            : `Filtro aplicado por grupo/categoría: ${selectedGroup?.displayName || "seleccionado"}.`,
      };

      setFromDate(productReportFromDate);
      setToDate(productReportToDate);
      createReportTab(preset, customMeta, snapshot);
      setProductReportModalOpen(false);
    } catch (err) {
      setProductReportDateError(
        err instanceof Error ? err.message : "No se pudo generar el reporte."
      );
    }

  }, [
    productReportMode,
    selectedReportProduct,
    selectedGroupPath,
    token,
    mergedGroupOptions,
    productReportFromDate,
    productReportToDate,
    productReportResultMode,
    sourceFilter,
    createReportTab,
  ]);

  const handleProductReportQuickRange = useCallback((value: QuickRange) => {
    const todayKey = getBogotaDateKey();
    const todayStart = buildBogotaDateFromKey(todayKey);
    let startKey = todayKey;
    let endKey = todayKey;
    switch (value) {
      case "today":
        break;
      case "yesterday":
        startKey = getBogotaDateKey(
          new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
        );
        endKey = startKey;
        break;
      case "week":
        startKey = getBogotaDateKey(
          new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
        );
        break;
      case "month":
        {
          const { year, month } = getBogotaDateParts();
          startKey = `${year}-${month}-01`;
        }
        break;
      case "previous_month":
        {
          const today = buildBogotaDateFromKey(todayKey);
          const prevMonthAnchor = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 15, 12, 0, 0)
          );
          const { year, month } = getBogotaDateParts(prevMonthAnchor);
          startKey = `${year}-${month}-01`;
          const monthEnd = new Date(
            Date.UTC(Number(year), Number(month), 0, 12, 0, 0)
          );
          const { day } = getBogotaDateParts(monthEnd);
          endKey = `${year}-${month}-${day}`;
        }
        break;
      case "year":
        {
          const { year } = getBogotaDateParts();
          startKey = `${year}-01-01`;
        }
        break;
      default:
        break;
    }
    setProductReportFromDate(startKey);
    setProductReportToDate(endKey);
    setProductReportDateError(null);
  }, []);

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
    (preset: ReportPreset, variant: "default" | "favorite" = "default") => {
      const isActive = selectedPresetId === preset.id;
      const isFavorite = favoriteReportIds.includes(preset.id);
      const isFavoriteVariant = variant === "favorite";
      return (
        <li
          key={preset.id}
          className={`px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors snap-start last:pb-4 ${
            isFavoriteVariant
              ? isActive
                ? "bg-amber-200/55"
                : "hover:bg-amber-100/60"
              : isActive
              ? "bg-emerald-500/10"
              : "hover:bg-slate-900"
          }`}
          onClick={() => handleSelectPreset(preset.id)}
        >
          <div className="flex-1 min-w-0">
            <p
              className={`font-semibold ${
                isFavoriteVariant ? "text-amber-950" : "text-slate-100"
              }`}
            >
              {preset.title}
            </p>
            <p
              className={`text-[11px] line-clamp-2 ${
                isFavoriteVariant ? "text-amber-900/85" : "text-slate-400"
              }`}
            >
              {preset.description}
            </p>
            <p
              className={`mt-1 text-[11px] ${
                isFavoriteVariant ? "text-amber-900/75" : "text-slate-500"
              }`}
            >
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
                ? isFavoriteVariant
                  ? "text-amber-700 hover:text-amber-800"
                  : "text-amber-400 hover:text-amber-300"
                : isFavoriteVariant
                ? "text-amber-600/70 hover:text-amber-700"
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
    [
      selectedPresetId,
      favoriteReportIds,
      handleSelectPreset,
      toggleFavorite,
    ]
  );

  const activeReportTab =
    activeTabId === "selector"
      ? null
      : openReports.find((tab) => tab.id === activeTabId) ?? null;
  const activeReportPreset = useMemo(
    () =>
      activeReportTab
        ? REPORT_PRESETS.find((p) => p.id === activeReportTab.presetId) ?? null
        : null,
    [activeReportTab]
  );
  const activeReportSnapshot = useMemo(() => {
    if (!activeReportTab?.resultSnapshot) return null;
    if (activeReportTab.presetId === "products-top") {
      return null;
    }
    if (!activeReportTab.snapshotSavedAt) return activeReportTab.resultSnapshot;
    const savedAt = Date.parse(activeReportTab.snapshotSavedAt);
    if (!Number.isFinite(savedAt)) return activeReportTab.resultSnapshot;
    const age = Date.now() - savedAt;
    if (age > REPORT_SNAPSHOT_TTL_MS) return null;
    return activeReportTab.resultSnapshot;
  }, [activeReportTab]);

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
              listos para imprimir, exportar o compartir.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/dashboard/reports"
              className="px-3 py-1.5 rounded-full border text-xs border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-400/60"
            >
              Volver al centro ejecutivo
            </Link>
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
        {activeReportTab && activeReportPreset && (
          <ReportDocumentViewer
            preset={activeReportPreset}
            filterMeta={activeReportTab.filterMeta}
            salesData={salesData}
            changesData={changesData}
            consolidatedDailySeries={consolidatedDailySeries}
            resultOverride={activeReportSnapshot}
            companyInfo={companyInfo}
            token={token}
            settingsError={settingsError}
            onClose={() => handleCloseReportTab(activeReportTab.id)}
            resolveMethodLabel={resolveMethodLabel}
            productGroupById={productGroupById}
            productGroupBySku={productGroupBySku}
          />
        )}

        {(!activeReportTab || !activeReportPreset) && (
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

              <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1 pb-3 snap-y snap-mandatory">
                {favoritePresets.length > 0 && (
                  <div className="rounded-2xl border border-amber-400/80 bg-gradient-to-br from-amber-100 via-amber-50 to-white shadow-[0_10px_24px_-18px_rgba(180,83,9,0.55)] overflow-hidden">
                    <div className="px-4 py-2 border-b border-amber-300/70 text-xs uppercase tracking-wide text-amber-800 font-bold flex items-center justify-between">
                      <span>Favoritos</span>
                      <span>{favoritePresets.length}</span>
                    </div>
                    <ul className="divide-y divide-amber-300/60 text-sm border-b border-amber-300/60 bg-amber-50/50">
                      {favoritePresets.map((preset) =>
                        renderPresetRow(preset, "favorite")
                      )}
                    </ul>
                  </div>
                )}
                {Object.entries(groupedPresets).map(([scope, presets]) => (
                  <div
                    key={scope}
                    className="rounded-2xl border border-slate-700/80 bg-slate-900/85 overflow-hidden shadow-[0_12px_24px_-18px_rgba(2,6,23,0.8)]"
                  >
                    <div className="px-4 py-2 border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                      {scope}
                    </div>
                    <ul className="divide-y divide-slate-800 text-sm border-b border-slate-700/80 bg-slate-950/25">
                      {presets.map((preset) => renderPresetRow(preset))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Columna derecha: filtros + resumen */}
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 md:p-6 space-y-5 backdrop-blur supports-[backdrop-filter]:bg-slate-950/55 shadow-lg sticky top-[4.5rem]">
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-slate-400">
                    Filtros del informe
                  </p>
                  <h3 className="text-lg font-semibold text-slate-50">
                    Rango y alcance
                  </h3>
                  {currentPreset ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                      Informe seleccionado:{" "}
                      <strong className="text-slate-100">{currentPreset.title}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 text-sm">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                    <p className="text-[11px] font-medium text-slate-500">
                      Fechas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-400">
                          Desde
                        </span>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => handleFromDateChange(e.target.value)}
                          onClick={(e) => {
                            const input = e.currentTarget;
                            if (typeof input.showPicker === "function") {
                              try {
                                input.showPicker();
                              } catch {
                                // Algunos navegadores requieren un gesto de usuario estricto.
                              }
                            }
                          }}
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-400">
                          Hasta
                        </span>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => handleToDateChange(e.target.value)}
                          onClick={(e) => {
                            const input = e.currentTarget;
                            if (typeof input.showPicker === "function") {
                              try {
                                input.showPicker();
                              } catch {
                                // Algunos navegadores requieren un gesto de usuario estricto.
                              }
                            }
                          }}
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "today", label: "Hoy" },
                          { id: "yesterday", label: "Ayer" },
                          { id: "week", label: "Últimos 7 días" },
                          { id: "month", label: "Este mes" },
                          { id: "previous_month", label: "Mes anterior" },
                          { id: "year", label: "Este año" },
                        ] as { id: QuickRange; label: string }[]
                      ).map((quick) => (
                        <button
                          key={quick.id}
                          onClick={() => handleQuickRange(quick.id)}
                          className={`px-3 py-1 rounded-full border text-xs transition ${
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
                    <p className="text-[11px] font-medium text-slate-500">
                      Alcance
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-400">
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
                        <span className="text-[11px] font-medium text-slate-400">
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
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-400">
                          Fuente
                        </span>
                        <select
                          value={sourceFilter}
                          onChange={(e) =>
                            setSourceFilter(e.target.value as "all" | "metrik" | "aronium")
                          }
                          className="rounded-lg border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 text-slate-100 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
                        >
                          <option value="all">Ambas (Metrik + Aronium)</option>
                          <option value="metrik">Solo Metrik</option>
                          <option value="aronium">Solo Aronium</option>
                        </select>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-[11px] font-medium text-slate-400">
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

                <div className="flex flex-col gap-3 pt-2 border-t border-slate-800">
                  <button
                    className="px-4 py-3 text-sm rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => {
                      void handleOpenReport();
                    }}
                    disabled={
                      !currentPreset ||
                      salesLoading ||
                      !!salesError
                    }
                  >
                    {salesLoading ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        Generando reporte…
                        <LoadingSpinner size={16} className="!gap-0" />
                      </span>
                    ) : !currentPreset
                      ? "Selecciona un informe en la lista"
                      : !canViewReportDataset
                      ? "Sin acceso a datos operativos"
                      : "Generar reporte"}
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
                      setSourceFilter("all");
                    }}
                  >
                    Restablecer filtros
                  </button>
                  {!canViewReportDataset ? (
                    <p className="text-xs text-slate-400">
                      Este rol no tiene acceso al dataset necesario para generar
                      reportes.
                    </p>
                  ) : salesError ? (
                    <p className="text-xs text-rose-300">
                      Error al cargar las ventas: {salesError}
                    </p>
                  ) : !salesLoading && !salesData.length ? (
                    <p className="text-xs text-slate-400">
                      Aún no hay datos de ventas desde el POS para este
                      periodo.
                    </p>
                  ) : null}
                </div>
              </div>

            </section>
          </div>
        )}
      </div>
      {productReportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-2xl space-y-4 overflow-hidden">
            <div className={`space-y-4 ${salesLoading ? "pointer-events-none blur-[1.5px]" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-400">
                  Reporte de productos
                </p>
                <h3 className="text-lg font-semibold">
                  Ventas por producto o grupo
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Define fechas y el objetivo del reporte antes de generarlo.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
                onClick={() => setProductReportModalOpen(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  Desde
                </span>
                <input
                  type="date"
                  value={productReportFromDate}
                  onChange={(e) => {
                    setProductReportFromDate(e.target.value);
                    setProductReportDateError(null);
                  }}
                  className="rounded-lg border border-slate-700/70 bg-slate-900 px-3 py-2 text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  Hasta
                </span>
                <input
                  type="date"
                  value={productReportToDate}
                  onChange={(e) => {
                    setProductReportToDate(e.target.value);
                    setProductReportDateError(null);
                  }}
                  className="rounded-lg border border-slate-700/70 bg-slate-900 px-3 py-2 text-slate-100"
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
                  { id: "previous_month", label: "Mes anterior" },
                  { id: "year", label: "Este año" },
                ] as { id: QuickRange; label: string }[]
              ).map((quick) => {
                const isActive = (() => {
                  const todayKey = getBogotaDateKey();
                  if (
                    quick.id === "today" &&
                    productReportFromDate === todayKey &&
                    productReportToDate === todayKey
                  ) {
                    return true;
                  }
                  if (quick.id === "yesterday") {
                    const yKey = getBogotaDateKey(
                      new Date(
                        buildBogotaDateFromKey(todayKey).getTime() -
                          24 * 60 * 60 * 1000
                      )
                    );
                    return (
                      productReportFromDate === yKey && productReportToDate === yKey
                    );
                  }
                  if (quick.id === "week") {
                    const startKey = getBogotaDateKey(
                      new Date(
                        buildBogotaDateFromKey(todayKey).getTime() -
                          6 * 24 * 60 * 60 * 1000
                      )
                    );
                    return (
                      productReportFromDate === startKey &&
                      productReportToDate === todayKey
                    );
                  }
                  if (quick.id === "month") {
                    const { year, month } = getBogotaDateParts();
                    return (
                      productReportFromDate === `${year}-${month}-01` &&
                      productReportToDate === todayKey
                    );
                  }
                  if (quick.id === "previous_month") {
                    const today = buildBogotaDateFromKey(todayKey);
                    const prevMonthAnchor = new Date(
                      Date.UTC(
                        today.getUTCFullYear(),
                        today.getUTCMonth() - 1,
                        15,
                        12,
                        0,
                        0
                      )
                    );
                    const { year, month } = getBogotaDateParts(prevMonthAnchor);
                    const start = `${year}-${month}-01`;
                    const monthEnd = new Date(
                      Date.UTC(Number(year), Number(month), 0, 12, 0, 0)
                    );
                    const { day } = getBogotaDateParts(monthEnd);
                    const end = `${year}-${month}-${day}`;
                    return (
                      productReportFromDate === start &&
                      productReportToDate === end
                    );
                  }
                  if (quick.id === "year") {
                    const { year } = getBogotaDateParts();
                    return (
                      productReportFromDate === `${year}-01-01` &&
                      productReportToDate === todayKey
                    );
                  }
                  return false;
                })();
                return (
                  <button
                    key={quick.id}
                    type="button"
                    className={`px-3 py-1.5 rounded-full border text-xs ${
                      isActive
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-300"
                    }`}
                    onClick={() => handleProductReportQuickRange(quick.id)}
                  >
                    {quick.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full border text-xs ${
                  productReportMode === "product"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
                onClick={() => {
                  setProductReportMode("product");
                  setProductReportResultMode("detailed");
                }}
              >
                Por producto
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full border text-xs ${
                  productReportMode === "group"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
                onClick={() => {
                  setProductReportMode("group");
                  setProductReportResultMode("grouped");
                }}
              >
                Por grupo / categoría
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Mostrar resultados
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-full border text-xs ${
                    productReportResultMode === "grouped"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                  onClick={() => setProductReportResultMode("grouped")}
                >
                  Agrupado
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-full border text-xs ${
                    productReportResultMode === "detailed"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                  onClick={() => setProductReportResultMode("detailed")}
                >
                  Uno por uno
                </button>
              </div>
            </div>

            {productReportMode === "product" ? (
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    Buscar producto
                  </span>
                  <input
                    type="text"
                    value={productQuery}
                    onChange={(e) => {
                      setProductQuery(e.target.value);
                      setSelectedReportProduct(null);
                    }}
                    placeholder="Nombre, SKU o código..."
                    className="rounded-lg border border-slate-700/70 bg-slate-900 px-3 py-2 text-slate-100"
                  />
                </label>
                {productQuery.trim() ? (
                  <div className="max-h-40 overflow-auto rounded-lg border border-slate-800 bg-slate-900/70">
                    {productSearchResults.length ? (
                      productSearchResults.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="w-full border-b border-slate-800 px-3 py-2 text-left text-xs hover:bg-slate-800/60 last:border-b-0"
                          onClick={() => {
                            setSelectedReportProduct(product);
                            setProductQuery(
                              product.sku
                                ? `${product.name} (${product.sku})`
                                : product.name
                            );
                          }}
                        >
                          <span className="block font-semibold text-slate-100">
                            {product.name}
                          </span>
                          <span className="block text-slate-400">
                            SKU: {product.sku || "—"} · Grupo:{" "}
                            {product.groupName || "Sin grupo"}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-slate-400">
                        Sin coincidencias.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">
                  Grupo / categoría
                </span>
                <select
                  value={selectedGroupPath}
                  onChange={(e) => setSelectedGroupPath(e.target.value)}
                  className="rounded-lg border border-slate-700/70 bg-slate-900 px-3 py-2 text-slate-100"
                >
                  <option value="">Selecciona un grupo</option>
                  {mergedGroupOptions.map((group) => {
                    const depth = Math.max(0, group.path.split("/").length - 1);
                    const prefix = depth > 0 ? `${"· ".repeat(depth)}` : "";
                    return (
                    <option key={group.id} value={group.path}>
                      {`${prefix}${group.displayName}`}
                    </option>
                    );
                  })}
                </select>
              </label>
            )}

            {productLookupLoading ? (
              <p className="text-xs text-slate-400">Cargando catálogo...</p>
            ) : null}
            {productLookupError ? (
              <p className="text-xs text-rose-300">
                Error cargando productos/grupos: {productLookupError}
              </p>
            ) : null}
            {productReportDateError ? (
              <p className="text-xs text-amber-300">
                {productReportDateError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="px-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={() => setProductReportModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 text-xs rounded-lg bg-emerald-500 text-slate-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => {
                  void handleCreateProductTargetReport();
                }}
                disabled={
                  salesLoading ||
                  productLookupLoading ||
                  (productReportMode === "product" && !selectedReportProduct) ||
                  (productReportMode === "group" && !selectedGroupPath)
                }
              >
                Generar reporte
              </button>
            </div>
            </div>
            {salesLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 backdrop-blur-[1.5px]">
                <LoadingSpinner size={56} label="Generando reporte..." />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {productsTopSortModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl">
            <h3 className="text-lg font-semibold">Top productos vendidos</h3>
            <p className="mt-1 text-sm text-slate-300">
              Configura cómo quieres construir el ranking antes de generar el reporte.
              Por defecto se ordena por cantidad vendida.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setProductsTopSortChoice("value")}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  productsTopSortChoice === "value"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                }`}
              >
                <p className="text-sm font-semibold">Por valor vendido</p>
                <p className="mt-1 text-xs text-slate-400">
                  Ordena del mayor al menor por total en dinero.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setProductsTopSortChoice("units")}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  productsTopSortChoice === "units"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                }`}
              >
                <p className="text-sm font-semibold">Por cantidad vendida</p>
                <p className="mt-1 text-xs text-slate-400">
                  Ordena del mayor al menor por unidades vendidas.
                </p>
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Límite del ranking</p>
              <div className="flex flex-wrap gap-2">
                {([10, 20, 50, 100] as const).map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => setProductsTopLimitChoice(limit)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      productsTopLimitChoice === limit
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    Top {limit}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Alcance del análisis</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setProductsTopScopeChoice("global");
                    setProductsTopCategoryKeyChoice("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    productsTopScopeChoice === "global"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  Top global
                </button>
                <button
                  type="button"
                  onClick={() => setProductsTopScopeChoice("category")}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    productsTopScopeChoice === "category"
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  Top por categoría
                </button>
              </div>
              {productsTopScopeChoice === "category" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setProductsTopCategoryModeChoice("group");
                      setProductsTopCategoryKeyChoice("");
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      productsTopCategoryModeChoice === "group"
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    Grupo / categoría principal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProductsTopCategoryModeChoice("subgroup");
                      setProductsTopCategoryKeyChoice("");
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      productsTopCategoryModeChoice === "subgroup"
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    Subcategoría / subgrupo final
                  </button>
                </div>
              ) : null}
              {productsTopScopeChoice === "category" ? (
                <label className="mt-1 flex flex-col gap-1 text-sm">
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {productsTopCategoryModeChoice === "subgroup"
                      ? "Subcategoría / subgrupo"
                      : "Grupo / categoría"}
                  </span>
                  <select
                    value={productsTopCategoryKeyChoice}
                    onChange={(event) =>
                      setProductsTopCategoryKeyChoice(event.target.value)
                    }
                    className="rounded-lg border border-slate-700/70 bg-slate-900 px-3 py-2 text-slate-100"
                  >
                    <option value="">
                      {productsTopCategoryModeChoice === "subgroup"
                        ? "Selecciona una subcategoría"
                        : "Selecciona una categoría"}
                    </option>
                    {(productsTopCategoryModeChoice === "subgroup"
                      ? productsTopSubcategoryOptions
                      : productsTopCategoryOptions
                    ).map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProductsTopSortModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmOpenProductsTopReport();
                }}
                disabled={
                  salesLoading ||
                  productLookupLoading ||
                  (productsTopScopeChoice === "category" &&
                    !productsTopCategoryKeyChoice)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salesLoading ? (
                  <>
                    Generando...
                    <LoadingSpinner size={16} className="!gap-0" />
                  </>
                ) : (
                  "Generar reporte"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {categorySalesModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-950 p-6 text-slate-100 shadow-2xl">
            <h3 className="text-lg font-semibold">Ventas por categoría</h3>
            <p className="mt-1 text-sm text-slate-300">
              Elige cómo quieres agrupar la categoría antes de generar el reporte.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCategorySalesModeChoice("full")}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  categorySalesModeChoice === "full"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                }`}
              >
                <p className="text-sm font-semibold">Categorías completas</p>
                <p className="mt-1 text-xs text-slate-400">
                  Incluye categoría y subcategoría (ej. Sonido/Cabinas).
                </p>
              </button>
              <button
                type="button"
                onClick={() => setCategorySalesModeChoice("main")}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  categorySalesModeChoice === "main"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
                }`}
              >
                <p className="text-sm font-semibold">Solo categoría principal</p>
                <p className="mt-1 text-xs text-slate-400">
                  Agrupa por la raíz (ej. Sonido, Cables, Miscelanea).
                </p>
              </button>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategorySalesModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmOpenCategorySalesReport();
                }}
                disabled={salesLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salesLoading ? (
                  <>
                    Generando...
                    <LoadingSpinner size={16} className="!gap-0" />
                  </>
                ) : (
                  "Generar reporte"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
