export type SaleTicketSourceItem = {
  id?: number | null;
  product_name?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  unit_price_original?: number | null;
  discount?: number | null;
  line_discount_value?: number | null;
  total?: number | null;
};

export type SaleTicketItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type SaleTicketLineBreakdown = SaleTicketItem & {
  subtotal: number;
  discount: number;
  key: string;
};

export type SaleTicketDisplayLine = SaleTicketLineBreakdown & {
  cartDiscountShare: number;
  displayTotal: number;
};

export type SaleTicketDisplayBreakdown = {
  lines: SaleTicketDisplayLine[];
  subtotal: number;
  lineDiscountTotal: number;
  cartDiscountTotal: number;
};

export function buildSaleTicketLineBreakdown(
  items: SaleTicketSourceItem[]
): {
  lines: SaleTicketLineBreakdown[];
  subtotal: number;
  lineDiscountTotal: number;
} {
  const lines = (items ?? []).map((item, index) => {
    const quantity = Number(item.quantity ?? 1) || 1;
    const unitOriginal =
      typeof item.unit_price_original === "number" && item.unit_price_original >= 0
        ? item.unit_price_original
        : typeof item.unit_price === "number" && item.unit_price >= 0
        ? item.unit_price
        : 0;
    const gross = unitOriginal * quantity;
    const discountValue =
      typeof item.line_discount_value === "number"
        ? item.line_discount_value
        : typeof item.discount === "number"
        ? item.discount
        : 0;
    const total =
      typeof item.total === "number"
        ? item.total
        : Math.max(0, gross - discountValue);
    const discount = Math.max(0, gross - total);

    return {
      name: item.product_name ?? item.name ?? "Producto",
      quantity,
      unitPrice: unitOriginal,
      subtotal: gross,
      total,
      discount,
      key: `${item.id ?? index}-${item.product_name ?? item.name ?? "producto"}`,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const lineDiscountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
  return { lines, subtotal, lineDiscountTotal };
}

export function buildSaleTicketDisplayBreakdown(
  items: SaleTicketSourceItem[],
  cartDiscountValue = 0
): SaleTicketDisplayBreakdown {
  const lineBreakdown = buildSaleTicketLineBreakdown(items);
  const lineTotalForCartDiscount = lineBreakdown.lines.reduce(
    (sum, line) => sum + line.total,
    0
  );
  const cartDiscountTotal = Math.max(0, cartDiscountValue);
  let remainingCartDiscount = cartDiscountTotal;

  const lines = lineBreakdown.lines.map((line, index) => {
    let cartDiscountShare = 0;
    if (cartDiscountTotal > 0 && lineTotalForCartDiscount > 0) {
      if (index === lineBreakdown.lines.length - 1) {
        cartDiscountShare = remainingCartDiscount;
      } else {
        cartDiscountShare =
          (cartDiscountTotal * line.total) / lineTotalForCartDiscount;
        remainingCartDiscount = Math.max(
          0,
          remainingCartDiscount - cartDiscountShare
        );
      }
    }

    return {
      ...line,
      cartDiscountShare,
      displayTotal: Math.max(0, line.total - cartDiscountShare),
    };
  });

  return {
    lines,
    subtotal: lineBreakdown.subtotal,
    lineDiscountTotal: lineBreakdown.lineDiscountTotal,
    cartDiscountTotal,
  };
}
