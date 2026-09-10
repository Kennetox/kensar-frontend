import qrcode from "qrcode-generator";

export function generateQrDataUrl(value: string, cellSize = 8, margin = 2): string {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}
