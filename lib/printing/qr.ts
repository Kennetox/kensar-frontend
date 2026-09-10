import qrcode from "qrcode-generator";

export function generateQrSvg(value: string, cellSize = 4, margin = 2): string {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  return qr
    .createSvgTag(cellSize, margin)
    .replace("<svg ", '<svg shape-rendering="crispEdges" ')
    .replace("<path ", '<path shape-rendering="crispEdges" ');
}
