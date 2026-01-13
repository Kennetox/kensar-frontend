import type { PosSettingsPayload } from "@/lib/api/settings";
import { generateCode128Svg } from "@/lib/utils/barcode";
import { formatBogotaDate } from "@/lib/time/bogota";

export type SaleTicketItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type SaleTicketPayment = {
  label: string;
  amount: number;
};

export type ReturnTicketItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  sku?: string | null;
};

export type ReturnTicketPayment = {
  label: string;
  amount: number;
};

export type SaleTicketCustomer = {
  name: string;
  phone?: string;
  email?: string;
  taxId?: string;
  address?: string;
};

export type SeparatedTicketPayment = {
  label: string;
  amount: number;
  paidAt?: string;
  method?: string;
};

export type TicketCustomerLike = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  address?: string | null;
};

export function buildSaleTicketCustomer(
  customer?: TicketCustomerLike | null
): SaleTicketCustomer | undefined {
  if (!customer?.name) {
    return undefined;
  }

  const payload: SaleTicketCustomer = {
    name: customer.name,
  };

  if (customer.phone) {
    payload.phone = customer.phone;
  }
  if (customer.email) {
    payload.email = customer.email;
  }
  if (customer.taxId) {
    payload.taxId = customer.taxId;
  }
  if (customer.address) {
    payload.address = customer.address;
  }

  return payload;
}

export type SaleTicketOptions = {
  documentNumber: string;
  saleNumber: number | string;
  date: Date;
  subtotal: number;
  lineDiscountTotal: number;
  cartDiscountLabel: string;
  cartDiscountValueDisplay: string;
  surchargeLabel?: string;
  surchargeValueDisplay?: string;
  surchargeAmount?: number;
  total: number;
  items: SaleTicketItem[];
  payments: SaleTicketPayment[];
  changeAmount?: number;
  notes?: string | null;
  posName?: string;
  vendorName?: string;
  settings?: PosSettingsPayload | null;
  customer?: SaleTicketCustomer | null;
  separatedInfo?: {
    dueDate?: string | null;
    balance?: number;
    payments: SeparatedTicketPayment[];
  };
};

export type ReturnTicketOptions = {
  settings?: PosSettingsPayload | null;
  documentNumber: string;
  originalDocumentNumber?: string | null;
  createdAt?: string | null;
  posName?: string | null;
  sellerName?: string | null;
  items: ReturnTicketItem[];
  payments: ReturnTicketPayment[];
  totalRefund: number;
  notes?: string | null;
};

export type ClosureTicketMethod = {
  label: string;
  amount: number;
};

export type ClosureTicketUserBreakdown = {
  name: string;
  total: number;
};

export type ClosureTicketOptions = {
  documentNumber: string;
  closedAt: Date;
  posName?: string | null;
  responsible: string;
  rangeSummary?: {
    startLabel: string;
    endLabel: string;
  };
  totals: {
    registered: number;
    refunds: number;
    net: number;
    expectedCash: number;
    countedCash: number;
    difference: number;
  };
  methods: ClosureTicketMethod[];
  userBreakdown?: ClosureTicketUserBreakdown[];
  notes?: string | null;
  settings?: PosSettingsPayload | null;
  separatedSummary?: {
    tickets: number;
    paymentsTotal: number;
    reservedTotal: number;
    pendingTotal: number;
  };
};

const FALLBACK_COMPANY = {
  name: "Kensar Electronic",
  address: "Cra. 15 #123 - Bogotá",
  phone: "+57 300 000 0000",
  taxId: "NIT 900000000-0",
  email: "contacto@kensar.com",
  footer: "Gracias por tu compra.",
};

const getUploadsBase = (): string => {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    const apiPort =
      !port || port === "3000" ? "8000" : port;
    return `${protocol}//${hostname}:${apiPort}`;
  }
  const globalLocation =
    typeof globalThis !== "undefined"
      ? (globalThis as { location?: Location }).location
      : undefined;
  if (globalLocation?.origin) {
    return globalLocation.origin.replace(/\/$/, "");
  }
  return "";
};

const isUploadsPath = (value: string): boolean =>
  /^\/?uploads\//i.test(value);

const getCurrentOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const globalLocation =
    typeof globalThis !== "undefined"
      ? (globalThis as { location?: Location }).location
      : undefined;
  if (globalLocation?.origin) {
    return globalLocation.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
};

const resolveLogoUrl = (raw?: string | null): string => {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  if (/^data:/i.test(trimmed)) return trimmed;

  const origin = getCurrentOrigin();
  const uploadsBase = getUploadsBase();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith("//")) {
    const protocol = origin
      ? new URL(origin).protocol
      : uploadsBase
      ? new URL(uploadsBase).protocol
      : "https:";
    return `${protocol}${trimmed}`;
  }

  const normalized = trimmed.startsWith("/")
    ? trimmed
    : `/${trimmed}`;

  const useUploadsBase = isUploadsPath(normalized);
  const base = useUploadsBase
    ? uploadsBase || origin
    : origin || uploadsBase;

  if (!base) return trimmed;
  const sanitizedBase = base.replace(/\/$/, "");
  return `${sanitizedBase}${normalized}`;
};

const extractSettingsLogo = (
  settings?: PosSettingsPayload | null
): string | undefined => {
  const raw =
    settings?.logoUrl ??
    settings?.logo_url ??
    settings?.ticket_logo_url ??
    "";
  const trimmed = raw?.trim();
  return trimmed || undefined;
};

function escapeHtml(value?: string | null): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: number): string {
  return `$ ${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatMoneySigned(value: number): string {
  const amount = Math.abs(value);
  const formatted = formatMoney(amount);
  return value < 0 ? `-${formatted}` : formatted;
}

function formatDisplayDate(value?: string | null): string {
  if (!value) return "";
  return (
    formatBogotaDate(value, {
      dateStyle: "short",
      timeStyle: "short",
    }) || value
  );
}

export function renderReturnTicket(options: ReturnTicketOptions): string {
  const settings = options.settings;
  const companyName =
    settings?.company_name?.trim() || FALLBACK_COMPANY.name;
  const taxId = settings?.tax_id?.trim() || FALLBACK_COMPANY.taxId;
  const address = settings?.address?.trim() || FALLBACK_COMPANY.address;
  const phone = settings?.contact_phone?.trim() || FALLBACK_COMPANY.phone;
  const email = settings?.contact_email?.trim() || FALLBACK_COMPANY.email;
  const footer = settings?.ticket_footer?.trim() || FALLBACK_COMPANY.footer;
  const logoUrl = resolveLogoUrl(extractSettingsLogo(settings));

  const itemsRows = options.items.length
    ? options.items
        .map(
          (item) => `
          <div class="item-row">
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${item.quantity} × ${formatMoney(item.unitPrice)}</div>
            <div class="item-total">${formatMoneySigned(-Math.abs(item.total))}</div>
          </div>`
        )
        .join("")
    : '<div class="muted">Sin productos devueltos.</div>';

  const paymentRows = options.payments
    .filter((payment) => Math.abs(payment.amount) > 0)
    .map(
      (payment) => `
      <div class="row">
        <span>${escapeHtml(payment.label)}</span>
        <span>${formatMoneySigned(-Math.abs(payment.amount))}</span>
      </div>`
    )
    .join("");

  const originalDoc = options.originalDocumentNumber
    ? `<div>Venta original: ${escapeHtml(options.originalDocumentNumber)}</div>`
    : "";
  const sellerLine = options.sellerName
    ? `<div>Vendedor: ${escapeHtml(options.sellerName)}</div>`
    : "";
  const posLine = options.posName
    ? `<div>POS: ${escapeHtml(options.posName)}</div>`
    : "";

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Devolución ${escapeHtml(options.documentNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; background: #fff; color: #000000; }
          .ticket { max-width: 340px; margin: 0 auto; padding: 18px; }
          .header { text-align: center; }
          .logo { max-height: 60px; margin-bottom: 8px; }
          .title { font-size: 20px; font-weight: 800; letter-spacing: 0.04em; color: #000000; }
          .badge { display: inline-block; margin-top: 6px; padding: 5px 12px; border-radius: 999px; border: 2px solid #000000; color: #000000; font-size: 13px; font-weight: 800; letter-spacing: 0.08em; }
          .meta { font-size: 14px; text-align: left; margin-top: 12px; color: #000000; }
          .meta div { margin-bottom: 4px; }
          .section { margin-top: 12px; }
          .line { border-top: 2px solid #000000; margin: 12px 0; }
          .row { display: flex; justify-content: space-between; font-size: 14px; margin: 4px 0; color: #000000; }
          .items { margin-top: 6px; }
          .item-row { border-bottom: 2px solid #000000; padding: 8px 0; }
          .item-name { font-size: 14px; font-weight: 700; color: #000000; }
          .item-meta { font-size: 13px; color: #000000; }
          .item-total { font-size: 14px; text-align: right; color: #000000; font-weight: 700; }
          .total { font-size: 16px; font-weight: 800; color: #000000; }
          .muted { font-size: 13px; color: #000000; }
        </style>
      </head>
      <body>
        <div class="ticket">
          <div class="header">
            ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="${escapeHtml(companyName)}" />` : ""}
            <div class="title">${escapeHtml(companyName)}</div>
            <div class="muted">${escapeHtml(address)}</div>
            <div class="muted">${escapeHtml(taxId)}</div>
            <div class="muted">${escapeHtml(phone)} · ${escapeHtml(email)}</div>
            <div class="badge">DEVOLUCIÓN</div>
          </div>
          <div class="meta">
            <div>Documento: ${escapeHtml(options.documentNumber)}</div>
            ${originalDoc}
            ${posLine}
            ${sellerLine}
            <div>Fecha: ${escapeHtml(formatDisplayDate(options.createdAt))}</div>
          </div>
          <div class="line"></div>
          <div class="section">
            <div class="row">
              <span>Total devolución</span>
              <span class="total">${formatMoneySigned(-Math.abs(options.totalRefund))}</span>
            </div>
          </div>
          <div class="section">
            <div class="row"><span>Detalle de productos</span></div>
            <div class="items">${itemsRows}</div>
          </div>
          ${paymentRows
            ? `<div class="section">
                <div class="row"><span>Reembolso</span></div>
                ${paymentRows}
              </div>`
            : ""}
          ${options.notes ? `<div class="section muted">Notas: ${escapeHtml(options.notes)}</div>` : ""}
          <div class="line"></div>
          <div class="muted" style="text-align:center;">${escapeHtml(footer)}</div>
        </div>
      </body>
    </html>
  `;
}

export function renderSaleTicket(options: SaleTicketOptions): string {
  const settings = options.settings;
  const companyName =
    settings?.company_name?.trim() || FALLBACK_COMPANY.name;
  const taxId = settings?.tax_id?.trim() || FALLBACK_COMPANY.taxId;
  const address = settings?.address?.trim() || FALLBACK_COMPANY.address;
  const phone = settings?.contact_phone?.trim() || FALLBACK_COMPANY.phone;
  const email = settings?.contact_email?.trim() || FALLBACK_COMPANY.email;
  const footer = settings?.ticket_footer?.trim() || FALLBACK_COMPANY.footer;
  const logoUrl = resolveLogoUrl(extractSettingsLogo(settings));

  const paymentRows = options.payments.length
    ? options.payments
        .map(
          (payment) => `
          <div class="row">
            <span>${escapeHtml(payment.label)}</span>
            <span>${formatMoney(payment.amount)}</span>
          </div>`
        )
        .join("")
    : '<div class="row"><span>Sin pagos registrados</span><span>0</span></div>';
  const separatedPaymentBadge = options.separatedInfo
    ? `<div class="separated-badge">Venta por separado</div>`
    : "";

  const changeRow =
    typeof options.changeAmount === "number" && options.changeAmount !== 0
      ? `<div class="row">
            <span>${options.changeAmount > 0 ? "Cambio" : "Saldo"}</span>
            <span>${formatMoney(Math.abs(options.changeAmount))}</span>
          </div>`
      : "";
  const separatedBlock = options.separatedInfo
    ? (() => {
        const payments = options.separatedInfo?.payments ?? [];
        const paymentsRows = payments.length
          ? payments
              .map((entry) => {
                const metaParts: string[] = [];
                if (entry.method) metaParts.push(entry.method);
                if (entry.paidAt) metaParts.push(formatDisplayDate(entry.paidAt));
                const meta =
                  metaParts.length > 0
                    ? `<div class="sep-meta">${metaParts
                        .map((part) => escapeHtml(part))
                        .join(" · ")}</div>`
                    : "";
                return `<div class="row separated-row">
                  <div>
                    <div class="sep-label">${escapeHtml(entry.label)}</div>
                    ${meta}
                  </div>
                  <span>${formatMoney(entry.amount)}</span>
                </div>`;
              })
              .join("")
          : '<div class="row separated-row"><div class="sep-label">Sin abonos registrados</div><span>0</span></div>';
        const dueLine = options.separatedInfo?.dueDate
          ? `<div class="line"><span>Fecha límite</span><span>${formatDisplayDate(
              options.separatedInfo?.dueDate
            )}</span></div>`
          : "";
        const balanceLine =
          typeof options.separatedInfo?.balance === "number"
            ? `<div class="row separated-row balance-row">
                <div class="sep-label">Saldo pendiente</div>
                <span>${formatMoney(Math.max(options.separatedInfo.balance, 0))}</span>
              </div>`
            : "";
        return `<div class="separator"></div>
          <div class="section">
            <div class="line-title">Detalle de abonos</div>
            ${dueLine}
            <div class="payments">${paymentsRows}</div>
            ${balanceLine}
          </div>`;
      })()
    : "";

  const itemsRows = options.items.length
    ? options.items
        .map((item) => {
          const gross = item.quantity * item.unitPrice;
          const discount = Math.max(0, gross - item.total);
          const discountLabel =
            discount > 0
              ? `<span class="item-discount">(Desc -${formatMoney(discount)})</span>`
              : "";
          return `
        <div class="item-row">
          <div>
            <div class="item-name">${escapeHtml(item.name)}</div>
            <div class="item-meta">${item.quantity} x ${formatMoney(
              item.unitPrice
            )} ${discountLabel}</div>
          </div>
          <div class="item-total">${formatMoney(item.total)}</div>
        </div>`;
        })
        .join("")
    : '<div class="item-row"><div class="item-name">Sin artículos</div></div>';

  const customerLines =
    options.customer && options.customer.name
      ? [
          `<div class="line-title">Cliente</div>`,
          `<div class="customer-name">${escapeHtml(
            options.customer.name
          )}</div>`,
          options.customer.phone
            ? `<div class="customer-detail">Tel: ${escapeHtml(
                options.customer.phone
              )}</div>`
            : "",
          options.customer.email
            ? `<div class="customer-detail">Email: ${escapeHtml(
                options.customer.email
              )}</div>`
            : "",
          options.customer.taxId
            ? `<div class="customer-detail">NIT / ID: ${escapeHtml(
                options.customer.taxId
              )}</div>`
            : "",
          options.customer.address
            ? `<div class="customer-detail">Dirección: ${escapeHtml(
                options.customer.address
              )}</div>`
            : "",
        ].join("")
      : "";

  const notesBlock =
    options.notes && options.notes.trim().length
      ? `<div class="section">
          <div class="line-title">Notas</div>
          <div class="notes">${escapeHtml(options.notes)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `<div>${line}</div>`)
            .join("")}</div>
        </div>`
      : "";

  const rawSaleNumber = String(options.saleNumber ?? "")
    .replace(/\D/g, "")
    .trim();
  const fallbackFromDoc = options.documentNumber
    ? options.documentNumber.replace(/\D/g, "").trim()
    : "";
  const numericValue = rawSaleNumber || fallbackFromDoc || "0";
  const paddedValue =
    numericValue.length >= 6
      ? numericValue
      : numericValue.padStart(6, "0");
  const barcodeSvg = generateCode128Svg(paddedValue, {
    height: 30,
    moduleWidth: 2,
    includeText: true,
    includeTextFontSize: 12,
    quietZoneModules: 10,
  });

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charSet="utf-8" />
      <title>Ticket ${escapeHtml(options.documentNumber)}</title>
      <style>
        @page { margin: 4mm; }
        * { box-sizing: border-box; }
        body {
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          width: 80mm;
          margin: 0 auto;
          font-size: 13px;
          color: #0f172a;
          background: #ffffff;
        }
        .ticket {
          padding: 3mm 3mm 8mm;
        }
        .logo {
          text-align: center;
          margin-bottom: 8px;
        }
        .logo img {
          max-width: 60mm;
          max-height: 28mm;
          object-fit: contain;
        }
        h1 {
          font-size: 20px;
          text-align: center;
          margin: 0;
        }
        .company-info {
          text-align: center;
          color: #111827;
          font-size: 13px;
          line-height: 1.4;
          margin-top: 4px;
        }
        .separator {
          border-top: 1px solid #111827;
          margin: 10px 0;
        }
        .line-title {
          font-size: 12px;
          letter-spacing: 0.08em;
          color: #111827;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .customer-name {
          font-weight: 600;
          font-size: 14px;
        }
        .customer-detail {
          color: #111827;
          font-size: 12px;
        }
        .line {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 2px;
          line-height: 1.4;
        }
        .line span:last-child {
          min-width: 38mm;
          text-align: right;
          font-weight: 700;
        }
        .items {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          gap: 4mm;
        }
        .item-row > div:first-child {
          max-width: 46mm;
        }
        .item-name {
          font-weight: 600;
        }
        .item-meta {
          color: #0f172a;
          font-size: 11px;
        }
        .item-discount {
          color: #0f172a;
          margin-left: 4px;
        }
        .item-total {
          font-weight: 600;
          min-width: 25mm;
          text-align: right;
        }
        .totals {
          display: flex;
          justify-content: space-between;
          font-size: 20px;
          margin-top: 8px;
        }
        .totals span {
          font-weight: 800;
          font-size: 20px;
        }
        .totals strong {
          font-size: 20px;
          font-weight: 800;
        }
        .payments .row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 2px;
        }
        .payments .row span:last-child {
          min-width: 30mm;
          text-align: right;
        }
        .separated-badge {
          font-size: 12px;
          font-weight: 600;
          color: #0f172a;
          text-align: center;
          margin: 4px 0 4px;
        }
        .separated-row {
          align-items: flex-start;
        }
        .sep-label {
          font-weight: 600;
        }
        .sep-meta {
          font-size: 11px;
          color: #111827;
        }
        .section { margin-bottom: 12px; }
        .barcode { margin-top: 16px; text-align: center; }
        .barcode svg {
          width: 96%;
          height: auto;
        }
        .footer {
          margin-top: 16px;
          text-align: center;
          font-size: 12px;
          color: #111827;
          line-height: 1.4;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        <div class="logo">
          ${
            logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" />`
              : `<strong>${escapeHtml(companyName)}</strong>`
          }
        </div>
        <h1>${escapeHtml(companyName)}</h1>
        <div class="company-info">
          ${escapeHtml(address)}<br />
          ${escapeHtml(phone)} · ${escapeHtml(email)}<br />
          ${escapeHtml(taxId)}<br />
          CONSERVA ESTE RECIBO Y EMPAQUE ORIGINAL PARA GARANTÍA
        </div>

        <div class="separator"></div>

        ${customerLines}
        ${customerLines ? '<div class="separator"></div>' : ''}
        <div class="section">
          <div class="line"><span>No. Recibo</span><span>${escapeHtml(
            options.documentNumber
          )}</span></div>
          <div class="line"><span>Fecha</span><span>${formatBogotaDate(
            options.date,
            { dateStyle: "short", timeStyle: "short" }
          )}</span></div>
          ${
            options.vendorName
              ? `<div class="line"><span>Usuario</span><span>${escapeHtml(
                  options.vendorName
                )}</span></div>`
              : ""
          }
          ${
            options.posName
              ? `<div class="line"><span>POS</span><span>${escapeHtml(
                  options.posName
                )}</span></div>`
              : ""
          }
        </div>

        <div class="separator"></div>
        <div class="section">
          <div class="line-title">Detalle de productos</div>
          <div class="items">
            ${itemsRows}
          </div>
        </div>

        <div class="separator"></div>
        <div class="section">
          <div class="line"><span>Subtotal</span><span>${formatMoney(
            options.subtotal
          )}</span></div>
          ${
            options.lineDiscountTotal > 0
              ? `<div class="line">
                   <span>Descuento artículos</span>
                   <span>- ${formatMoney(options.lineDiscountTotal)}</span>
                 </div>`
              : ""
          }
          <div class="line">
            <span>${escapeHtml(options.cartDiscountLabel)}</span>
            <span>${escapeHtml(options.cartDiscountValueDisplay)}</span>
          </div>
          ${
            options.surchargeLabel &&
            (typeof options.surchargeAmount === "number"
              ? options.surchargeAmount > 0
              : Boolean(options.surchargeValueDisplay && options.surchargeValueDisplay.trim()))
              ? `<div class="line">
                   <span>${escapeHtml(options.surchargeLabel)}</span>
                   <span>${
                     typeof options.surchargeAmount === "number" &&
                     options.surchargeAmount > 0
                       ? `+ ${formatMoney(options.surchargeAmount)}`
                       : escapeHtml(
                           options.surchargeValueDisplay?.startsWith("+")
                             ? options.surchargeValueDisplay
                             : `+${options.surchargeValueDisplay ?? ""}`
                         )
                   }</span>
                 </div>`
              : ""
          }
        </div>

        <div class="separator"></div>
        <div class="section">
          <div class="line-title">Pagos recibidos</div>
          ${separatedPaymentBadge}
          <div class="payments">
            ${paymentRows}
            ${changeRow}
          </div>
        </div>

        ${separatedBlock}

        <div class="totals">
          <span>TOTAL</span>
          <strong>${formatMoney(options.total)}</strong>
        </div>

        ${notesBlock}

        <div class="barcode">${barcodeSvg}</div>

        <div class="footer">
          ${footer
            .split("\n")
            .map((line) => `<div>${escapeHtml(line)}</div>`)
            .join("")}
        </div>
      </div>
    </body>
  </html>`;
}

export function renderSaleInvoice(options: SaleTicketOptions): string {
  const settings = options.settings;
  const companyName =
    settings?.company_name?.trim() || FALLBACK_COMPANY.name;
  const taxId = settings?.tax_id?.trim() || FALLBACK_COMPANY.taxId;
  const address = settings?.address?.trim() || FALLBACK_COMPANY.address;
  const phone = settings?.contact_phone?.trim() || FALLBACK_COMPANY.phone;
  const email = settings?.contact_email?.trim() || FALLBACK_COMPANY.email;
  const footer = settings?.ticket_footer?.trim() || FALLBACK_COMPANY.footer;
  const logoUrl = resolveLogoUrl(extractSettingsLogo(settings));

  const paymentTotal =
    options.payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0) ||
    options.total;
  const balance = Math.max(0, options.total - paymentTotal);

  const itemRows = options.items.length
    ? options.items
        .map((item, index) => {
          const qty = item.quantity ?? 1;
          const unit =
            item.unitPrice && item.unitPrice > 0
              ? item.unitPrice
              : qty > 0
              ? item.total / qty
              : item.total;
          const gross = unit * qty;
          const discount = Math.max(0, gross - item.total);
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.name)}</td>
              <td>${qty}</td>
              <td>${formatMoney(unit)}</td>
              <td>${discount > 0 ? "-${formatMoney(discount)}" : "0"}</td>
              <td>${formatMoney(item.total)}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="muted">Sin artículos</td></tr>`;

  const customerLines = [
    options.customer?.name
      ? escapeHtml(options.customer.name)
      : "Cliente Final",
    options.customer?.taxId
      ? `NIT / Documento: ${escapeHtml(options.customer.taxId)}`
      : "",
    options.customer?.address
      ? `Dirección: ${escapeHtml(options.customer.address)}`
      : "",
    options.customer?.phone
      ? `Teléfono: ${escapeHtml(options.customer.phone)}`
      : "",
    options.customer?.email
      ? `Email: ${escapeHtml(options.customer.email)}`
      : "",
  ]
    .filter(Boolean)
    .join("<br />");

  const paymentRows = options.payments.length
    ? options.payments
        .map(
          (payment) => `
            <tr>
              <td>${escapeHtml(payment.label)}</td>
              <td>${formatMoney(payment.amount)}</td>
            </tr>`
        )
        .join("")
    : `<tr><td>Pago registrado</td><td>${formatMoney(options.total)}</td></tr>`;

  const dateString =
    formatBogotaDate(options.date, {
      dateStyle: "short",
      timeStyle: "short",
    }) || "";

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charSet="utf-8" />
      <title>Factura ${escapeHtml(options.documentNumber)}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          margin: 0;
          padding: 32px;
          background: #f3f4f6;
          color: #0f172a;
        }
        .sheet {
          width: 210mm;
          margin: 0 auto;
          background: #ffffff;
          padding: 28px 32px 40px;
          border: 1px solid #d1d5db;
        }
        header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 2px solid #1f2937;
          padding-bottom: 12px;
          margin-bottom: 18px;
        }
        .company blockquote {
          margin: 0;
        }
        .company h1 {
          margin: 0;
          font-size: 22px;
          letter-spacing: 0.08em;
        }
        .company p {
          margin: 2px 0;
          font-size: 12px;
        }
        .meta {
          text-align: right;
          font-size: 12px;
        }
        .meta div {
          margin-bottom: 4px;
        }
        .meta .doc-number {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .logo img {
          max-width: 140px;
          max-height: 60px;
          object-fit: contain;
          margin-bottom: 8px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 18px;
          font-size: 12px;
        }
        .info-box {
          border: 1px solid #d1d5db;
          padding: 12px;
        }
        .info-box strong {
          display: block;
          margin-bottom: 8px;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.08em;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        thead {
          background: #f8fafc;
        }
        th, td {
          padding: 8px 10px;
          border: 1px solid #e5e7eb;
          text-align: left;
        }
        th {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #475569;
        }
        td:nth-child(1) { width: 36px; text-align: center; }
        td:nth-child(3),
        td:nth-child(4),
        td:nth-child(5),
        td:nth-child(6) {
          text-align: right;
        }
        .totals {
          width: 300px;
          margin-left: auto;
          margin-top: 16px;
          font-size: 13px;
        }
        .totals tr td:first-child {
          text-align: right;
          padding-right: 12px;
        }
        .totals tr td:last-child {
          text-align: right;
          font-weight: 600;
        }
        .totals tr.total td {
          font-size: 15px;
          font-weight: 700;
        }
        .payments {
          margin-top: 20px;
          width: 340px;
          font-size: 12px;
        }
        .payments th,
        .payments td {
          text-align: left;
        }
        .footer-note {
          margin-top: 24px;
          font-size: 11.5px;
          text-align: center;
          color: #475569;
        }
        footer {
          margin-top: 18px;
          font-size: 11px;
          text-align: right;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <header>
          <div class="company">
            <h1>FACTURA</h1>
            <p><strong>${escapeHtml(companyName)}</strong></p>
            <p>${escapeHtml(address)}</p>
            <p>Tel: ${escapeHtml(phone)} · Email: ${escapeHtml(email)}</p>
            <p>NIT: ${escapeHtml(taxId)}</p>
          </div>
          <div class="meta">
            <div class="logo">${
              logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" />`
                : ""
            }</div>
            <div class="doc-number">${escapeHtml(options.documentNumber)}</div>
            <div>Fecha: ${dateString}</div>
            <div>POS: ${escapeHtml(options.posName ?? "")}</div>
            <div>Cajero: ${escapeHtml(options.vendorName ?? "")}</div>
          </div>
        </header>

        <div class="info-grid">
          <div class="info-box">
            <strong>Cliente</strong>
            ${customerLines}
          </div>
          <div class="info-box">
            <strong>Resumen</strong>
            <div>Ticket #: ${escapeHtml(options.documentNumber)}</div>
            <div>Documentos: ${escapeHtml(options.documentNumber)}</div>
            <div>Estado del pago: ${balance > 0 ? "Pendiente" : "Pagado"}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Descripción</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Desc.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table class="totals">
          <tr>
            <td>Subtotal</td>
            <td>${formatMoney(options.subtotal)}</td>
          </tr>
          ${
            options.lineDiscountTotal > 0
              ? `<tr><td>Descuento artículos</td><td>- ${formatMoney(
                  options.lineDiscountTotal
                )}</td></tr>`
              : ""
          }
          <tr>
            <td>${escapeHtml(options.cartDiscountLabel)}</td>
            <td>${escapeHtml(options.cartDiscountValueDisplay)}</td>
          </tr>
          ${
            options.surchargeLabel &&
            (typeof options.surchargeAmount === "number"
              ? options.surchargeAmount !== 0
              : Boolean(options.surchargeValueDisplay?.trim()))
              ? `<tr><td>${escapeHtml(options.surchargeLabel)}</td><td>${
                  typeof options.surchargeAmount === "number"
                    ? (options.surchargeAmount >= 0 ? "+ " : "- ") +
                      formatMoney(Math.abs(options.surchargeAmount))
                    : escapeHtml(options.surchargeValueDisplay ?? "")
                }</td></tr>`
              : ""
          }
          <tr class="total">
            <td>Total</td>
            <td>${formatMoney(options.total)}</td>
          </tr>
        </table>

        <table class="payments">
          <thead>
            <tr>
              <th>Método</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${paymentRows}
            <tr>
              <td><strong>Pagado</strong></td>
              <td><strong>${formatMoney(paymentTotal)}</strong></td>
            </tr>
            <tr>
              <td><strong>Saldo</strong></td>
              <td><strong>${formatMoney(balance)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer-note">
          ${footer
            .split("\n")
            .map((line) => `<div>${escapeHtml(line)}</div>`)
            .join("")}
        </div>
        <footer>Página 1</footer>
      </div>
    </body>
  </html>`;
}
export function renderClosureTicket(options: ClosureTicketOptions): string {
  const settings = options.settings;
  const companyName =
    settings?.company_name?.trim() || FALLBACK_COMPANY.name;
  const taxId = settings?.tax_id?.trim() || FALLBACK_COMPANY.taxId;
  const address = settings?.address?.trim() || FALLBACK_COMPANY.address;
  const phone = settings?.contact_phone?.trim() || FALLBACK_COMPANY.phone;
  const email = settings?.contact_email?.trim() || FALLBACK_COMPANY.email;
  const logoUrl = resolveLogoUrl(extractSettingsLogo(settings));

  const methodRows = options.methods.length
    ? options.methods
        .map(
          (method) => `
        <div class="row">
          <span>${escapeHtml(method.label)}</span>
          <span>${formatMoney(method.amount)}</span>
        </div>`
        )
        .join("")
    : '<div class="row"><span>Sin métodos registrados</span><span>$ 0</span></div>';

  const userRows =
    options.userBreakdown && options.userBreakdown.length
      ? options.userBreakdown
          .map(
            (user) => `
        <div class="row">
          <span>${escapeHtml(user.name)}</span>
          <span>${formatMoney(user.total)}</span>
        </div>`
          )
          .join("")
      : "";

  const notesBlock =
    options.notes && options.notes.trim().length
      ? `<div class="block">
          <div class="muted">Notas</div>
          <div>${escapeHtml(options.notes)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `<div>${line}</div>`)
            .join("")}</div>
        </div>`
      : "";

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charSet="utf-8" />
      <title>Reporte ${escapeHtml(options.documentNumber)}</title>
      <style>
        @page { margin: 4mm; }
        body {
          font-family: "Helvetica Neue", Arial, sans-serif;
          width: 80mm;
          margin: 0 auto;
          font-size: 12px;
          color: #0f172a;
        }
        h1 { font-size: 18px; text-align: center; margin: 2px 0; }
        .center { text-align: center; }
        .muted { color: #374151; font-size: 11px; }
        .subtitle { font-size: 12px; font-weight: 700; }
        .block { margin-top: 10px; }
        hr { border: none; border-top: 1px solid #111827; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; font-size: 12px; }
        .row.emphasize {
          font-weight: 700;
          border-bottom: 1px solid #111827;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .logo { text-align: center; margin-bottom: 8px; }
        .logo img { max-height: 28mm; max-width: 60mm; object-fit: contain; }
      </style>
    </head>
    <body>
      ${logoUrl ? `<div class="logo"><img src="${escapeHtml(logoUrl)}" alt="Logo" /></div>` : ""}
      <h1>${escapeHtml(companyName)}</h1>
      <div class="center muted">${escapeHtml(address)}</div>
      <div class="center muted">${escapeHtml(phone)}</div>
      <div class="center muted">${escapeHtml(email)}</div>
      <div class="center muted">${escapeHtml(taxId)}</div>
      <div class="center muted subtitle" style="margin-top:4px;">Reporte Z - Cierre de caja</div>
      <hr />
      <div class="block">
        <div class="row"><span>No. Reporte</span><span>${escapeHtml(options.documentNumber)}</span></div>
        <div class="row"><span>Fecha cierre</span><span>${formatBogotaDate(
          options.closedAt,
          { dateStyle: "short", timeStyle: "short" }
        )}</span></div>
        ${
          options.rangeSummary
            ? `<div class="row"><span>Ventas del</span><span>${escapeHtml(
                options.rangeSummary.startLabel === options.rangeSummary.endLabel
                  ? options.rangeSummary.startLabel
                  : `${options.rangeSummary.startLabel} - ${options.rangeSummary.endLabel}`
              )}</span></div>`
            : ""
        }
        ${options.posName ? `<div class="row"><span>POS</span><span>${escapeHtml(options.posName)}</span></div>` : ""}
        <div class="row"><span>Responsable</span><span>${escapeHtml(options.responsible)}</span></div>
      </div>
      <hr />
      <div class="block">
        <div class="row"><span>Total registrado</span><span>${formatMoney(options.totals.registered)}</span></div>
        <div class="row"><span>Devoluciones / reembolsos</span><span>- ${formatMoney(options.totals.refunds)}</span></div>
        <div class="row emphasize"><span>Neto del día</span><span>${formatMoney(options.totals.net)}</span></div>
        <div class="row"><span>Efectivo esperado</span><span>${formatMoney(options.totals.expectedCash)}</span></div>
        <div class="row"><span>Efectivo contado</span><span>${formatMoney(options.totals.countedCash)}</span></div>
        <div class="row"><span>Diferencia</span><span>${formatMoney(options.totals.difference)}</span></div>
      </div>
      <hr />
      <div class="block">
        <div class="muted">Detalle por método</div>
        ${methodRows}
      </div>
      ${
        userRows
          ? `<hr />
        <div class="block">
          <div class="muted">Ventas por usuario</div>
          ${userRows}
        </div>`
          : ""
      }
      ${
        options.separatedSummary
          ? `<hr />
        <div class="block">
          <div class="muted">Ventas por separado</div>
          <div class="row"><span>Tickets registrados</span><span>${options.separatedSummary.tickets}</span></div>
          <div class="row"><span>Abonos cobrados</span><span>${formatMoney(
              options.separatedSummary.paymentsTotal
            )}</span></div>
          <div class="row"><span>Total reservado</span><span>${formatMoney(
              options.separatedSummary.reservedTotal
            )}</span></div>
          <div class="row"><span>Saldo pendiente</span><span>${
            options.separatedSummary.pendingTotal > 0
              ? formatMoney(options.separatedSummary.pendingTotal)
              : "$ 0"
          }</span></div>
        </div>`
          : ""
      }
      ${notesBlock}
    </body>
  </html>`;
}
