export type PaymentAdjustmentEntry = {
  method: string;
  amount: number;
};

function isCashMethod(method: string): boolean {
  const normalized = method.trim().toLowerCase();
  return normalized === "cash" || normalized === "efectivo";
}

/**
 * Converts tendered payments into the amounts actually applied to the sale.
 * Change is returned from cash, so it must not be reassigned to another method.
 */
export function buildNetPaymentAllocation(
  payments: PaymentAdjustmentEntry[],
  changeAmount: number
): PaymentAdjustmentEntry[] {
  let remainingChange = Math.max(0, Number(changeAmount) || 0);

  return payments
    .map((payment) => {
      let amount = Math.max(0, Number(payment.amount) || 0);
      if (remainingChange > 0 && isCashMethod(payment.method)) {
        const returned = Math.min(amount, remainingChange);
        amount -= returned;
        remainingChange -= returned;
      }
      return { method: payment.method, amount };
    })
    .filter((payment) => payment.amount > 0.01);
}

export function capPaymentAllocation(
  payments: PaymentAdjustmentEntry[],
  maximumTotal: number
): PaymentAdjustmentEntry[] {
  let remaining = Math.max(0, Number(maximumTotal) || 0);
  return payments
    .map((payment) => {
      const amount = Math.min(
        Math.max(0, Number(payment.amount) || 0),
        remaining
      );
      remaining -= amount;
      return { method: payment.method, amount };
    })
    .filter((payment) => payment.amount > 0.01);
}
