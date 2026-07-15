import { PosNavigationOverlay } from "../components/PosNavigationOverlay";

export default function PaymentLoading() {
  return (
    <PosNavigationOverlay
      title="Abriendo pantalla de pago…"
      detail="Tu carrito permanece guardado."
    />
  );
}
