export type SeparatedOrderLookup = {
  barcode?: string;
  saleNumber?: number;
};

/**
 * Builds lookup attempts for values typed or scanned from a sale ticket.
 * Some scanners configured with a different keyboard layout read the dash in
 * `V-000123` as an apostrophe, so sale document codes are canonicalized first.
 */
export function buildSeparatedOrderLookups(rawValue: string): SeparatedOrderLookup[] {
  const value = rawValue.trim();
  if (!value) return [];

  const saleDocumentMatch = value.match(/^v[\s\-_'’]*(\d+)$/i);
  if (saleDocumentMatch) {
    const digits = saleDocumentMatch[1];
    return [
      { barcode: `V-${digits}` },
      { saleNumber: Number(digits) },
    ];
  }

  if (/^\d+$/.test(value)) {
    return [{ saleNumber: Number(value) }];
  }

  return [{ barcode: value }];
}
