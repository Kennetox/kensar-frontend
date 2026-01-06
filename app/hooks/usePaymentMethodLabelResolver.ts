"use client";

import { useCallback, useMemo } from "react";
import { usePaymentMethodsCatalog } from "./usePaymentMethodsCatalog";

export function usePaymentMethodLabelResolver() {
  const catalog = usePaymentMethodsCatalog();

  const labelMap = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((method) => {
      if (method.slug) {
        map.set(method.slug.toLowerCase(), method.name);
      }
    });
    map.set("mixed", "Pago combinado");
    return map;
  }, [catalog]);

  const getPaymentLabel = useCallback(
    (method?: string | null, emptyFallback = "—") => {
      if (!method) return emptyFallback;
      const normalized = method.toLowerCase();
      return labelMap.get(normalized) ?? method.toUpperCase();
    },
    [labelMap]
  );

  return { catalog, getPaymentLabel };
}
