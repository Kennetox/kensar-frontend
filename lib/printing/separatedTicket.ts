export type SeparatedTicketReconciliation = {
  amount: number;
  reference?: string;
  reconciledAt?: string;
};

type SeparatedReconciliationSource = {
  reconciled_amount?: number | null;
  resolution_reference?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  resolution_history?: Array<Record<string, unknown>> | null;
};

export function buildSeparatedTicketReconciliations(
  source?: SeparatedReconciliationSource | null
): SeparatedTicketReconciliation[] {
  const reconciledTotal = Math.max(0, Number(source?.reconciled_amount || 0));
  if (reconciledTotal <= 0) return [];

  const entries = (source?.resolution_history ?? [])
    .filter((event) => event.action === "reconcile")
    .map((event) => ({
      amount: Math.max(0, Number(event.amount || 0)),
      reference:
        typeof event.reference === "string" && event.reference.trim()
          ? event.reference.trim()
          : undefined,
      reconciledAt:
        typeof event.created_at === "string" ? event.created_at : undefined,
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0);

  const detailedTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
  if (detailedTotal < reconciledTotal - 0.01) {
    entries.push({
      amount: reconciledTotal - detailedTotal,
      reference: source?.resolution_reference?.trim() || undefined,
      reconciledAt: source?.resolved_at ?? source?.updated_at ?? undefined,
    });
  }

  return entries;
}
