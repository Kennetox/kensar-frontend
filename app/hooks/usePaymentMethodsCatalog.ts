"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";

const PAYMENT_METHODS_CACHE_KEY = "kensar_payment_methods_cache_v1";

const readCachedCatalog = (): PaymentMethodRecord[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PAYMENT_METHODS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PaymentMethodRecord[]) : null;
  } catch (err) {
    console.warn("No se pudo leer el cache de métodos de pago", err);
    return null;
  }
};

const writeCachedCatalog = (catalog: PaymentMethodRecord[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PAYMENT_METHODS_CACHE_KEY,
      JSON.stringify(catalog)
    );
  } catch (err) {
    console.warn("No se pudo guardar el cache de métodos de pago", err);
  }
};

type PaymentMethodsOptions = {
  fallbackToDefault?: boolean;
};

export function usePaymentMethodsCatalog(
  options: PaymentMethodsOptions = {}
) {
  const { fallbackToDefault = true } = options;
  const { token } = useAuth();
  const [catalog, setCatalog] = useState<PaymentMethodRecord[]>(() => {
    const cached = readCachedCatalog();
    if (cached && cached.length) return cached;
    return fallbackToDefault ? DEFAULT_PAYMENT_METHODS : [];
  });

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      if (!token) {
        const cached = readCachedCatalog();
        if (cached && cached.length) {
          setCatalog(cached);
        } else if (fallbackToDefault) {
          setCatalog(DEFAULT_PAYMENT_METHODS);
        } else {
          setCatalog([]);
        }
        return;
      }
      try {
        const data = await fetchPaymentMethods(token);
        if (!active) return;
        const nextCatalog = data.length
          ? data
          : fallbackToDefault
            ? DEFAULT_PAYMENT_METHODS
            : [];
        setCatalog(nextCatalog);
        if (data.length) {
          writeCachedCatalog(data);
        }
      } catch (err) {
        console.warn("No se pudieron cargar los métodos de pago", err);
        if (!active) return;
        setCatalog((prev) =>
          prev.length ? prev : fallbackToDefault ? DEFAULT_PAYMENT_METHODS : []
        );
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [token, fallbackToDefault]);

  return catalog;
}
