// Cambia a false para desactivar el recordatorio sin modificar el flujo de pago.
export const WARRANTY_REMINDER_ENABLED = true;
export const WARRANTY_REMINDER_UNIT_PRICE = 400_000;

type WarrantyReminderCartItem = {
  unitPrice: number;
  product: { name: string };
};

export type WarrantyReminderItem = {
  name: string;
  unitPrice: number;
};

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("es-CO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function hasWarrantyDecision(notes: string): boolean {
  return normalize(notes).includes("garantia");
}

export function getWarrantyReminderItems(
  cart: WarrantyReminderCartItem[],
  notes: string
): WarrantyReminderItem[] {
  if (!WARRANTY_REMINDER_ENABLED || hasWarrantyDecision(notes)) return [];

  return cart
    .filter((item) => Number(item.unitPrice) >= WARRANTY_REMINDER_UNIT_PRICE)
    .map((item) => ({
      name: item.product.name,
      unitPrice: Number(item.unitPrice),
    }));
}
