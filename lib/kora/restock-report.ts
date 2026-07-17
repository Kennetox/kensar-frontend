export type KoraRestockForecastItem = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  group_name?: string | null;
  price: number;
  units_today: number;
  qty_on_hand: number;
  stock_min: number;
  preferred_qty: number;
  reorder_point: number;
  effective_threshold: number;
  threshold_source: "configured" | "inferred" | "mixed";
  units_7d: number;
  units_lookback: number;
  daily_rate: number;
  coverage_days?: number | null;
  projected_demand: number;
  suggested_qty: number;
  urgency: "high" | "medium" | "low";
  last_sale_at?: string | null;
  last_movement_at?: string | null;
};

export type KoraRestockForecastResponse = {
  generated_at: string;
  source: "restock-forecast-v1";
  mode: "general" | "today";
  state: "alert" | "watch" | "calm";
  horizon_days: number;
  lookback_days: number;
  headline: string;
  summary_lines: string[];
  items: KoraRestockForecastItem[];
  recommended_actions: Array<{
    id: string;
    label: string;
    href?: string;
    intent?: string;
    inputOverride?: string;
  }>;
  conversation_starters: string[];
};

type KoraRestockReportRow = {
  sku: string;
  product_name: string;
  stock: number;
  price: number;
  units_today: number;
  coverage_days: string;
  suggested_qty: number;
  urgency: "high" | "medium" | "low";
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value || 0)));
}

function buildRestockReportRows(report: KoraRestockForecastResponse): KoraRestockReportRow[] {
  return report.items.map((item) => ({
    sku: item.sku?.trim() || "—",
    product_name: item.product_name,
    stock: Number(item.qty_on_hand ?? 0),
    price: Math.max(0, Number(item.price ?? 0)),
    units_today: Math.max(0, Number(item.units_today ?? 0)),
    coverage_days:
      item.coverage_days == null
        ? "—"
        : item.coverage_days < 1
          ? "< 1 día"
          : `${Math.round(item.coverage_days)} días`,
    suggested_qty: Math.max(0, Number(item.suggested_qty ?? 0)),
    urgency: item.urgency,
  }));
}

export function buildRestockReportHtml(report: KoraRestockForecastResponse) {
  const rows = buildRestockReportRows(report);
  const generatedAt = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(report.generated_at));
  const totalProducts = rows.length;
  const tableRowsHtml = rows
    .map((row) => {
      const urgencyLabel = row.urgency === "high" ? "Alta" : row.urgency === "medium" ? "Media" : "Baja";
      const urgencyColor =
        row.urgency === "high" ? "#dc2626" : row.urgency === "medium" ? "#d97706" : "#047857";
      return `
          <tr>
            <td>${escapeHtml(row.sku)}</td>
            <td>${escapeHtml(row.product_name)}</td>
            <td class="numeric">${row.stock.toFixed(0)}</td>
            <td class="numeric">${row.units_today.toFixed(0)}</td>
            <td>${escapeHtml(row.coverage_days)}</td>
            <td class="numeric">${row.suggested_qty.toFixed(0)}</td>
            <td><span style="color:${urgencyColor};font-weight:700">${urgencyLabel}</span></td>
            <td class="numeric">${formatMoney(row.price)}</td>
          </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reporte de reposición KORA</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #0f172a;
        background: #f8fafc;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        width: 100%;
        margin: 0 auto;
        padding: 0;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      }
      .page {
        width: 100%;
        border: 1px solid #dbe4f0;
        border-radius: 20px;
        overflow: hidden;
        background: #fff;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        padding: 18px 20px 16px;
        background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,197,94,0.04));
      }
      .brand {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .brand h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: 0.06em;
      }
      .brand p,
      .meta,
      .summary li,
      .muted {
        color: #475569;
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(16,185,129,0.12);
        color: #047857;
        font-weight: 700;
        font-size: 12px;
      }
      .mini-kpi {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.05);
        color: #475569;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .meta-stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
      }
      .meta-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 18px 0;
        padding: 0 20px;
      }
      .card {
        border: 1px solid #dbe4f0;
        border-radius: 18px;
        background: #fff;
        padding: 14px 16px;
      }
      .card .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      .card .value {
        font-size: 18px;
        font-weight: 800;
        color: #0f172a;
      }
      .table-wrap {
        margin: 0 20px 20px;
        border: 1px solid #dbe4f0;
        border-radius: 18px;
        overflow: hidden;
        background: #fff;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      thead th {
        position: sticky;
        top: 0;
        background: #0f172a;
        color: #fff;
        text-align: left;
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 12px 10px;
        border-bottom: 1px solid #0b1220;
      }
      thead th.numeric {
        text-align: right;
      }
      tbody td {
        border-top: 1px solid #e2e8f0;
        padding: 10px;
        font-size: 12px;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
      tbody tr:nth-child(even) td { background: #f8fafc; }
      .footer {
        margin: 0 20px 20px;
        font-size: 11px;
        color: #64748b;
      }
      .sku { width: 8%; }
      .name { width: 38%; }
      .stock { width: 9%; }
      .today { width: 7%; }
      .coverage { width: 11%; }
      .suggested { width: 10%; }
      .urgency { width: 8%; }
      .price { width: 9%; }
      @media print {
        body { background: #fff; }
        .page { border: none; border-radius: 0; }
        .sheet { padding: 0; }
        .table-wrap, .header, .card { break-inside: avoid; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="page">
      <div class="header">
        <div class="brand">
          <h1>KORA</h1>
          <p>Reporte operativo de reposición</p>
          <p>${escapeHtml(report.mode === "today" ? "Reposición de ventas de hoy" : "Reposición general")}</p>
        </div>
        <div class="meta meta-stack">
          <div class="meta-row">
            <div class="badge">Generado ${escapeHtml(generatedAt)}</div>
            <div class="mini-kpi">Lista: ${totalProducts.toLocaleString("es-CO")} productos</div>
          </div>
          <p style="margin-top:10px;">${escapeHtml(report.headline)}</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <colgroup>
            <col class="sku" />
            <col class="name" />
            <col class="stock" />
            <col class="today" />
            <col class="coverage" />
            <col class="suggested" />
            <col class="urgency" />
            <col class="price" />
          </colgroup>
          <thead>
            <tr>
              <th class="sku">SKU</th>
              <th class="name">Nombre</th>
              <th class="stock numeric">Stock</th>
              <th class="today numeric">Hoy</th>
              <th class="coverage">Cobertura</th>
              <th class="suggested numeric">Sugerido</th>
              <th class="urgency">Urgencia</th>
              <th class="price numeric">Precio</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml || `<tr><td colspan="8" class="muted">No hay productos para mostrar.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="footer">KORA puede ayudarte a revisar este documento, imprimirlo o guardarlo como PDF.</div>
      </div>
    </div>
  </body>
</html>`;
}
