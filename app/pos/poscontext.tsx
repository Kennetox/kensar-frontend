"use client";

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "../providers/AuthProvider";
import { getApiBase } from "@/lib/api/base";

export const POS_DISPLAY_NAME = "POS 1 · KENSAR ELECTRONIC";

// Tipos compartidos por POS y Pago
export type Product = {
  id: number;
  sku: string | null;
  name: string;
  price: number;
  cost: number;
  barcode: string | null;
  unit: string | null;
  stock_min: number;
  active: boolean;
  service: boolean;
  includes_tax: boolean;
  group_name: string | null;
  brand: string | null;
  supplier: string | null;
  preferred_qty: number | null;
  reorder_point: number | null;
  low_stock_alert: boolean | null;
  allow_price_change: boolean;
  image_url?: string | null;
  image_thumb_url?: string | null;
  tile_color?: string | null;
  group_meta?: {
    path: string;
    display_name?: string | null;
    image_url?: string | null;
    image_thumb_url?: string | null;
  } | null;
};

export type CartItem = {
  id: number;
  product: Product;
  quantity: number;
  unitPrice: number;
  lineDiscountValue: number;
  lineDiscountIsPercent: boolean;
  lineDiscountPercent: number;
  freeSaleReason?: string | null;
};

export type PosCustomer = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  address?: string | null;
};

type PosContextValue = {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  saleNotes: string;
  setSaleNotes: React.Dispatch<React.SetStateAction<string>>;
  selectedCustomer: PosCustomer | null;
  setSelectedCustomer: React.Dispatch<
    React.SetStateAction<PosCustomer | null>
  >;
  reservedSaleId: number | null;
  setReservedSaleId: React.Dispatch<React.SetStateAction<number | null>>;
  reservedSaleNumber: number | null;
  setReservedSaleNumber: React.Dispatch<React.SetStateAction<number | null>>;

  cartGrossSubtotal: number;
  cartLineDiscountTotal: number;
  cartSubtotal: number;
  cartTotalBeforeSurcharge: number;
  cartTotal: number;
  cartDiscountValue: number;
  cartDiscountPercent: number;
  setCartDiscountValue: React.Dispatch<React.SetStateAction<number>>;
  setCartDiscountPercent: React.Dispatch<React.SetStateAction<number>>;
  cartSurcharge: SurchargeState;
  setCartSurcharge: React.Dispatch<React.SetStateAction<SurchargeState>>;

  saleNumber: number;
  clearSale: () => void;
  setSaleNumber: (value: number) => void;
  refreshSaleNumber: () => Promise<number | null>;
};

export type SurchargeMethod = "addi" | "sistecredito" | "manual" | null;

export type SurchargeState = {
  method: SurchargeMethod;
  amount: number;
  enabled: boolean;
  isManual: boolean;
};

const PosContext = createContext<PosContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "kensar_pos_sale_number";
const SALE_NUMBER_CHANNEL = "kensar_pos_sale_number_channel";
const SESSION_STORAGE_KEY = "kensar_pos_session_v1";
const SESSION_STORAGE_VERSION = 1;

type PersistedSession = {
  version: number;
  updatedAt: string;
  cart: CartItem[];
  saleNotes: string;
  selectedCustomer: PosCustomer | null;
  cartDiscountValue: number;
  cartDiscountPercent: number;
  cartSurcharge: SurchargeState;
  reservedSaleId?: number | null;
  reservedSaleNumber?: number | null;
};

export function PosProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscountValue, setCartDiscountValue] = useState(0);
  const [cartDiscountPercent, setCartDiscountPercent] = useState(0);
  const [saleNumber, setSaleNumber] = useState<number>(1);
  const [saleNotes, setSaleNotes] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<PosCustomer | null>(null);
  const [reservedSaleId, setReservedSaleId] = useState<number | null>(null);
  const [reservedSaleNumber, setReservedSaleNumber] = useState<number | null>(null);
  const [cartSurcharge, setCartSurcharge] = useState<SurchargeState>({
    method: null,
    amount: 0,
    enabled: false,
    isManual: false,
  });
  const sessionHydratedRef = useRef(false);
  const { token } = useAuth();
  const saleNumberChannelRef = useRef<BroadcastChannel | null>(null);

  const persistSaleNumber = useCallback((value: number) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, value.toString());
  }, []);

  const refreshSaleNumber = useCallback(async (): Promise<number | null> => {
    if (!token) return null;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/pos/sales/next-number`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const data = await res.json();
      const next = Number(data?.next_sale_number);
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("Respuesta inválida del consecutivo");
      }

      setSaleNumber(next);
      persistSaleNumber(next);
      return next;
    } catch (err) {
      console.error("No se pudo obtener el siguiente número de venta", err);
      setSaleNumber((prev) => {
        const fallback = prev && prev > 0 ? prev + 1 : 1;
        persistSaleNumber(fallback);
        return fallback;
      });
      return null;
    }
  }, [persistSaleNumber, token]);

  // 1) Al montar el POS: intentar recuperar el número de venta y el estado del carrito
  useEffect(() => {
    if (typeof window === "undefined") return;
    let hasReservation = false;

    try {
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (rawSession) {
          const parsed: PersistedSession = JSON.parse(rawSession);
          if (parsed.version === SESSION_STORAGE_VERSION) {
          if (Array.isArray(parsed.cart) && parsed.cart.length > 0) {
            setCart(parsed.cart);
          }
          if (typeof parsed.saleNotes === "string") {
            setSaleNotes(parsed.saleNotes);
          }
          if (
            parsed.selectedCustomer &&
            typeof parsed.selectedCustomer === "object"
          ) {
            setSelectedCustomer(parsed.selectedCustomer);
          }
          if (typeof parsed.cartDiscountValue === "number") {
            setCartDiscountValue(parsed.cartDiscountValue);
          }
          if (typeof parsed.cartDiscountPercent === "number") {
            setCartDiscountPercent(parsed.cartDiscountPercent);
          }
          if (
            parsed.cartSurcharge &&
            typeof parsed.cartSurcharge === "object"
          ) {
            setCartSurcharge(parsed.cartSurcharge);
          }
          if (typeof parsed.reservedSaleId === "number") {
            setReservedSaleId(parsed.reservedSaleId);
            hasReservation = true;
          }
          if (typeof parsed.reservedSaleNumber === "number") {
            setReservedSaleNumber(parsed.reservedSaleNumber);
            setSaleNumber(parsed.reservedSaleNumber);
            hasReservation = true;
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                LOCAL_STORAGE_KEY,
                parsed.reservedSaleNumber.toString()
              );
            }
          }
        }
      }
    } catch (err) {
      console.warn("No se pudo restaurar la sesión del POS", err);
    } finally {
      sessionHydratedRef.current = true;
    }

    if (!hasReservation) {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setSaleNumber(parsed);
        }
      }
    }

    if (!hasReservation) {
      void refreshSaleNumber();
    }
  }, [refreshSaleNumber]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleStorage(event: StorageEvent) {
      if (event.key !== LOCAL_STORAGE_KEY) return;
      if (!sessionHydratedRef.current) return;
      if (reservedSaleId != null || reservedSaleNumber != null) return;
      if (!event.newValue) return;
      const parsed = parseInt(event.newValue, 10);
      if (Number.isNaN(parsed) || parsed <= 0) return;
      setSaleNumber((prev) => (parsed > prev ? parsed : prev));
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [reservedSaleId, reservedSaleNumber]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(SALE_NUMBER_CHANNEL);
    saleNumberChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (!sessionHydratedRef.current) return;
      if (reservedSaleId != null || reservedSaleNumber != null) return;
      const incoming = Number(
        typeof event.data === "object" && event.data
          ? event.data.saleNumber ?? event.data.value
          : event.data
      );
      if (!Number.isFinite(incoming) || incoming <= 0) return;
      setSaleNumber((prev) => (incoming > prev ? incoming : prev));
    };
    return () => {
      channel.close();
      saleNumberChannelRef.current = null;
    };
  }, [reservedSaleId, reservedSaleNumber]);

  // 2) Guardar siempre que cambie el número de venta
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionHydratedRef.current) return;
    if (reservedSaleId != null || reservedSaleNumber != null) return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, saleNumber.toString());
    if (saleNumberChannelRef.current) {
      saleNumberChannelRef.current.postMessage({ saleNumber });
    }
  }, [reservedSaleId, reservedSaleNumber, saleNumber]);

  useEffect(() => {
    if (!sessionHydratedRef.current) return;
    if (reservedSaleNumber == null) return;
    if (saleNumber !== reservedSaleNumber) {
      setSaleNumber(reservedSaleNumber);
    }
  }, [reservedSaleNumber, saleNumber]);

  // 2b) Persistir el estado del carrito/notas/cliente para recuperar sesiones
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionHydratedRef.current) return;

    const hasContent =
      cart.length > 0 ||
      Boolean(saleNotes.trim().length) ||
      !!selectedCustomer ||
      cartDiscountValue > 0 ||
      cartDiscountPercent > 0 ||
      cartSurcharge.enabled ||
      cartSurcharge.amount > 0 ||
      reservedSaleId != null ||
      reservedSaleNumber != null;

    if (!hasContent) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    const payload: PersistedSession = {
      version: SESSION_STORAGE_VERSION,
      updatedAt: new Date().toISOString(),
      cart,
      saleNotes,
      selectedCustomer,
      cartDiscountValue,
      cartDiscountPercent,
      cartSurcharge,
      reservedSaleId,
      reservedSaleNumber,
    };

    try {
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(payload)
      );
    } catch (err) {
      console.warn("No se pudo guardar la sesión del POS", err);
    }
  }, [
    cart,
    saleNotes,
    selectedCustomer,
    cartDiscountValue,
    cartDiscountPercent,
    cartSurcharge,
    reservedSaleId,
    reservedSaleNumber,
  ]);

  // ---- Cálculos de totales ----
  function calcLineTotal(item: CartItem): number {
    const gross = item.quantity * item.unitPrice;
    return Math.max(0, gross - item.lineDiscountValue);
  }

  const cartGrossSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart]
  );

  const cartLineDiscountTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.lineDiscountValue, 0),
    [cart]
  );

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + calcLineTotal(item), 0),
    [cart]
  );

  const discountFromPercent = useMemo(
    () => cartSubtotal * (cartDiscountPercent / 100),
    [cartSubtotal, cartDiscountPercent]
  );

  const cartTotalBeforeSurcharge = useMemo(
    () => Math.max(0, cartSubtotal - cartDiscountValue - discountFromPercent),
    [cartSubtotal, cartDiscountValue, discountFromPercent]
  );

  const cartTotal = useMemo(
    () =>
      Math.max(
        0,
        cartTotalBeforeSurcharge +
          (cartSurcharge.enabled ? cartSurcharge.amount : 0)
      ),
    [cartTotalBeforeSurcharge, cartSurcharge]
  );

  // 3) clearSale: limpiar venta y pasar al siguiente número
  function clearSale() {
    setCart([]);
    setCartDiscountPercent(0);
    setCartDiscountValue(0);
    setSaleNotes("");
    setSelectedCustomer(null);
    setReservedSaleId(null);
    setReservedSaleNumber(null);
    setCartSurcharge({
      method: null,
      amount: 0,
      enabled: false,
      isManual: false,
    });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    void refreshSaleNumber();
  }

  const value: PosContextValue = {
    cart,
    setCart,
    saleNotes,
    setSaleNotes,
    selectedCustomer,
    setSelectedCustomer,
    reservedSaleId,
    setReservedSaleId,
    reservedSaleNumber,
    setReservedSaleNumber,
    cartGrossSubtotal,
    cartLineDiscountTotal,
    cartSubtotal,
    cartTotalBeforeSurcharge,
    cartTotal,
    cartDiscountValue,
    cartDiscountPercent,
    setCartDiscountValue,
    setCartDiscountPercent,
    cartSurcharge,
    setCartSurcharge,
    saleNumber,
    clearSale,
    setSaleNumber,
    refreshSaleNumber,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) {
    throw new Error("usePos debe usarse dentro de <PosProvider>");
  }
  return ctx;
}
