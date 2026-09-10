const CSS_PIXELS_PER_MM = 96 / 25.4;
const QZ_INCHES_PER_MM = 1 / 25.4;
const MIN_PAGE_HEIGHT_MM = 80;
const MAX_PAGE_HEIGHT_MM = 1_000;
const HEIGHT_BUFFER_MM = 3;

export type QzThermalPage = {
  heightMm: number;
  htmlOptions: {
    pageWidth: number;
    pageHeight: number;
  };
};

/**
 * QZ Tray otherwise uses the printer driver's fixed page height and can shrink
 * a long receipt to fit it. Measure the generated receipt first so each job is
 * printed on a roll-sized custom page at its natural height.
 */
export async function measureQzThermalPage(
  html: string,
  widthMm: number
): Promise<QzThermalPage | null> {
  if (typeof document === "undefined" || widthMm !== 80) return null;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${widthMm}mm`,
    "height:1px",
    "border:0",
    "visibility:hidden",
    "pointer-events:none",
  ].join(";");

  const loaded = new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.onerror = () => resolve();
  });

  document.body.appendChild(frame);
  frame.srcdoc = html;

  try {
    await Promise.race([
      loaded,
      new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
    ]);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const frameDocument = frame.contentDocument;
    if (!frameDocument) return null;
    const { body, documentElement } = frameDocument;
    const heightPx = Math.max(
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
      documentElement?.scrollHeight ?? 0,
      documentElement?.offsetHeight ?? 0
    );
    if (!heightPx) return null;

    const heightMm = Math.min(
      MAX_PAGE_HEIGHT_MM,
      Math.max(
        MIN_PAGE_HEIGHT_MM,
        Math.ceil(heightPx / CSS_PIXELS_PER_MM + HEIGHT_BUFFER_MM)
      )
    );

    return {
      heightMm,
      htmlOptions: {
        pageWidth: widthMm * QZ_INCHES_PER_MM,
        pageHeight: heightMm * QZ_INCHES_PER_MM,
      },
    };
  } catch (error) {
    console.warn("No se pudo medir la altura del ticket térmico", error);
    return null;
  } finally {
    frame.remove();
  }
}
