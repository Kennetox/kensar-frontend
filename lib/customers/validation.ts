export type CustomerIdentity = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  tax_id?: string | null;
  address?: string | null;
};

function hasValue(value?: string | null) {
  return Boolean(value?.trim());
}

export function hasCustomerAdditionalInformation(customer?: CustomerIdentity | null) {
  if (!customer) return false;
  return [
    customer.phone,
    customer.email,
    customer.taxId,
    customer.tax_id,
    customer.address,
  ].some(hasValue);
}

export function isCustomerEligibleForSeparated(customer?: (CustomerIdentity & { id?: number | null }) | null) {
  return Boolean(
    customer?.id &&
      hasValue(customer.name) &&
      hasCustomerAdditionalInformation(customer)
  );
}

export const CUSTOMER_ADDITIONAL_INFO_MESSAGE =
  "Necesitas registrar al menos un dato adicional del cliente. Preferiblemente, el teléfono.";
