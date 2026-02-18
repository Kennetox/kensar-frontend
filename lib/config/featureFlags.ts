const parseBooleanFlag = (value: string | undefined, defaultValue: boolean) => {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return defaultValue;
};

export const REQUIRE_FREE_SALE_REASON = parseBooleanFlag(
  process.env.NEXT_PUBLIC_REQUIRE_FREE_SALE_REASON,
  true
);

export const SHOW_FREE_SALE_TRACEABILITY_REPORT = parseBooleanFlag(
  process.env.NEXT_PUBLIC_SHOW_FREE_SALE_TRACEABILITY_REPORT,
  REQUIRE_FREE_SALE_REASON
);
