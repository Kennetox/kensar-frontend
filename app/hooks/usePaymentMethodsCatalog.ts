"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import {
  DEFAULT_PAYMENT_METHODS,
  fetchPaymentMethods,
  type PaymentMethodRecord,
} from "@/lib/api/paymentMethods";

export function usePaymentMethodsCatalog() {
  const { token } = useAuth();
  const [catalog, setCatalog] =
    useState<PaymentMethodRecord[]>(DEFAULT_PAYMENT_METHODS);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      if (!token) {
        setCatalog(DEFAULT_PAYMENT_METHODS);
        return;
      }
      try {
        const data = await fetchPaymentMethods(token);
        if (!active) return;
        setCatalog(data.length ? data : DEFAULT_PAYMENT_METHODS);
      } catch (err) {
        console.warn("No se pudieron cargar los métodos de pago", err);
        if (!active) return;
        setCatalog(DEFAULT_PAYMENT_METHODS);
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [token]);

  return catalog;
}
