import qrcode from "qrcode-generator";

export function generateQrSvg(
  value: string,
  cellSize = 4,
  margin = 2,
  physicalSizeMm?: number
): string {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const svg = qr
    .createSvgTag(cellSize, margin)
    .replace("<svg ", '<svg shape-rendering="crispEdges" ')
    .replace("<path ", '<path shape-rendering="crispEdges" ');

  // Give the SVG its final physical size instead of asking CSS to resize it.
  // QR modules remain vector paths and QZ receives the intended 34 mm square.
  if (!physicalSizeMm) return svg;
  const physicalSize = `${physicalSizeMm}mm`;
  return svg.replace(
    /width="[^"]+" height="[^"]+"/,
    `width="${physicalSize}" height="${physicalSize}"`
  );
}
