const parseBooleanFlag = (value: string | undefined, defaultValue: boolean) => {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return defaultValue;
};

const DEFAULT_REQUIRE_FREE_SALE_REASON = true;
const DEFAULT_ENABLE_POS_CASH_EXPENSES = true;
const DEFAULT_ENABLE_POS_MOVEMENT_CLOSURE_TICKET = true;

export const REQUIRE_FREE_SALE_REASON = parseBooleanFlag(
  process.env.NEXT_PUBLIC_REQUIRE_FREE_SALE_REASON,
  DEFAULT_REQUIRE_FREE_SALE_REASON
);

export const SHOW_FREE_SALE_TRACEABILITY_REPORT = parseBooleanFlag(
  process.env.NEXT_PUBLIC_SHOW_FREE_SALE_TRACEABILITY_REPORT,
  REQUIRE_FREE_SALE_REASON
);

export const ENABLE_POS_CASH_EXPENSES = parseBooleanFlag(
  process.env.NEXT_PUBLIC_ENABLE_POS_CASH_EXPENSES,
  DEFAULT_ENABLE_POS_CASH_EXPENSES
);

export const ENABLE_POS_MOVEMENT_CLOSURE_TICKET = parseBooleanFlag(
  process.env.NEXT_PUBLIC_ENABLE_POS_MOVEMENT_CLOSURE_TICKET,
  DEFAULT_ENABLE_POS_MOVEMENT_CLOSURE_TICKET
);
