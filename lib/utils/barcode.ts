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

type Barcode128Options = {
  height?: number;
  moduleWidth?: number;
  includeText?: boolean;
  includeTextFontSize?: number;
  quietZoneModules?: number;
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

const CODE128_PATTERNS: string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

const CODE128_DEFAULTS: Required<Barcode128Options> = {
  height: 52,
  moduleWidth: 2,
  includeText: true,
  includeTextFontSize: 10,
  quietZoneModules: 10,
};

const sanitizeCode128CValue = (value: string): string => {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "0";
  return digits;
};

export function generateCode128Svg(
  value: string,
  options?: Barcode128Options
): string {
  const opts = { ...CODE128_DEFAULTS, ...(options ?? {}) };
  let data = sanitizeCode128CValue(value);
  if (data.length % 2 === 1) {
    data = `0${data}`;
  }
  const codes: number[] = [105]; // Start Code C
  for (let i = 0; i < data.length; i += 2) {
    codes.push(Number.parseInt(data.slice(i, i + 2), 10));
  }
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i += 1) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop

  const quietZone = opts.moduleWidth * opts.quietZoneModules;
  let width = quietZone;
  const segments: string[] = [];
  codes.forEach((code) => {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) return;
    for (let i = 0; i < pattern.length; i += 1) {
      const isBar = i % 2 === 0;
      const moduleCount = Number.parseInt(pattern[i]!, 10);
      const segmentWidth = moduleCount * opts.moduleWidth;
      if (isBar) {
        segments.push(
          `<rect x="${width.toFixed(2)}" y="0" width="${segmentWidth.toFixed(
            2
          )}" height="${opts.height}" fill="#000" />`
        );
      }
      width += segmentWidth;
    }
  });
  width += quietZone;

  const textBlock = opts.includeText
    ? `<text x="50%" y="${(opts.height + opts.includeTextFontSize).toFixed(
        2
      )}" font-family="monospace" font-size="${opts.includeTextFontSize}" font-weight="700" text-anchor="middle" fill="#0f172a">${
        data
      }</text>`
    : "";

  const totalHeight = opts.height + (opts.includeText ? 16 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(
    2
  )}" height="${totalHeight.toFixed(2)}" viewBox="0 0 ${width.toFixed(
    2
  )} ${totalHeight.toFixed(2)}">${segments.join("")}${textBlock}</svg>`;
}
