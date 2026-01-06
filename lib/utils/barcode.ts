const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nwnwnnnnw",
  "3": "wwnwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nwnwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nwnwnnwnn",
  A: "wnnnnwnnw",
  B: "nwnnnwnnw",
  C: "wwnnnwnnn",
  D: "nnnwnwnnw",
  E: "wnnwnwnnn",
  F: "nwnwnwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nwnnnwwnn",
  J: "nnnwnwwnn",
  K: "wnnnnnwwn",
  L: "nwnnnnwwn",
  M: "wwnnnnwnn",
  N: "nnnwnnwwn",
  O: "wnnwnnwwn",
  P: "nwnwnnwwn",
  Q: "nnnnnwwwn",
  R: "wnnnnwwwn",
  S: "nwnnnwwwn",
  T: "nnnwnwwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnwnnnnw",
  Y: "wnnwnnnnn",
  Z: "nwwwnnnnn",
  "-": "nwnnnnwnw",
  ".": "wnnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnwnn",
  "+": "nwnnnwnwn",
  "%": "nnnnwnwnw",
  "*": "nwnnwnwnn", // Start/stop
};

const CODE39_ALLOWED = /^[0-9A-Z.\- $/+%]*$/;

type BarcodeOptions = {
  height?: number;
  narrowWidth?: number;
  wideWidth?: number;
  includeText?: boolean;
  includeTextFontSize?: number;
};

const DEFAULT_OPTIONS: Required<BarcodeOptions> = {
  height: 48,
  narrowWidth: 1.5,
  wideWidth: 3.5,
  includeText: true,
  includeTextFontSize: 5,
};

function sanitizeValue(value: string): string {
  const upper = (value ?? "").toUpperCase().trim();
  const filtered = upper
    .split("")
    .filter((char) => CODE39_ALLOWED.test(char))
    .join("");
  return filtered.length > 0 ? filtered : "0000";
}

export function generateCode39Svg(value: string, options?: BarcodeOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  const sanitized = sanitizeValue(value);
  const encodedValue = `*${sanitized}*`;

  let width = 0;
  const segments: string[] = [];

  for (let cIndex = 0; cIndex < encodedValue.length; cIndex += 1) {
    const char = encodedValue[cIndex]!;
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i += 1) {
      const isBar = i % 2 === 0;
      const strokeWidth =
        pattern[i] === "w" ? opts.wideWidth : opts.narrowWidth;
      if (isBar) {
        segments.push(
          `<rect x="${width.toFixed(2)}" y="0" width="${strokeWidth.toFixed(
            2
          )}" height="${opts.height}" fill="#000" />`
        );
      }
      width += strokeWidth;
    }
    // Gap between characters
    width += opts.narrowWidth;
  }

  const viewWidth = width + opts.narrowWidth;
  const textBlock = opts.includeText
    ? `<text x="50%" y="${(opts.height + opts.includeTextFontSize).toFixed(
        2
      )}" font-family="monospace" font-size="${opts.includeTextFontSize}" text-anchor="middle" fill="#0f172a">${
        sanitized
      }</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewWidth.toFixed(
    2
  )}" height="${(opts.height + (opts.includeText ? 16 : 0)).toFixed(2)}" viewBox="0 0 ${viewWidth.toFixed(
    2
  )} ${(opts.height + (opts.includeText ? 16 : 0)).toFixed(2)}">${segments.join(
    ""
  )}${textBlock}</svg>`;
}
