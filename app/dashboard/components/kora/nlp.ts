const BOGOTA_TIME_ZONE = "America/Bogota";

function getBogotaDateKey(value: Date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const [year, month, day] = formatted.split("-");
  return `${year}-${month}-${day}`;
}

export type ParsedSpecificDate = {
  key: string;
  day: number;
  month: number;
  year: number;
};

export type PaymentMethodMatch = {
  keys: string[];
  slug: string;
  label: string;
};

export function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()]/g, " ")
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeQuery(value: string) {
  return normalizeQuery(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function hasTokenStartingWith(tokens: string[], prefixes: string[]) {
  return tokens.some((token) => prefixes.some((prefix) => token.startsWith(prefix)));
}

export function hasPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

export function queryContainsAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export function resolvePaymentMethodFromQuery(input: string): PaymentMethodMatch | null {
  const text = normalizeQuery(input);
  const methods: PaymentMethodMatch[] = [
    { keys: ["addi"], slug: "addi", label: "Addi" },
    { keys: ["sistecredito", "sistecredito"], slug: "sistecredito", label: "Sistecrédito" },
    { keys: ["efectivo", "cash"], slug: "cash", label: "Efectivo" },
    { keys: ["transferencia", "transfer"], slug: "transferencia", label: "Transferencia" },
    { keys: ["tarjeta", "card"], slug: "card", label: "Tarjeta" },
    { keys: ["nequi"], slug: "nequi", label: "Nequi" },
    { keys: ["daviplata"], slug: "daviplata", label: "Daviplata" },
  ];
  return methods.find((method) => method.keys.some((key) => text.includes(key))) ?? null;
}

export function parseSpecificDate(input: string): ParsedSpecificDate | null {
  const text = normalizeQuery(input);

  if (/\b(hoy)\b/.test(text)) {
    const key = getBogotaDateKey(new Date()) ?? "";
    if (!key) return null;
    const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
    return { key, day, month, year };
  }

  if (/\b(ayer)\b/.test(text)) {
    const target = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const key = getBogotaDateKey(target) ?? "";
    if (!key) return null;
    const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
    return { key, day, month, year };
  }

  if (/\b(anteayer)\b/.test(text)) {
    const target = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const key = getBogotaDateKey(target) ?? "";
    if (!key) return null;
    const [year, month, day] = key.split("-").map((part) => Number.parseInt(part, 10));
    return { key, day, month, year };
  }

  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const month = Number.parseInt(numeric[2], 10);
    const rawYear = numeric[3];
    const currentYear = Number.parseInt(
      new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Bogota" }).format(new Date()),
      10
    );
    let year = rawYear ? Number.parseInt(rawYear, 10) : currentYear;
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { key, day, month, year };
    }
  }

  const months: Record<string, number> = {
    enero: 1,
    ene: 1,
    febrero: 2,
    feb: 2,
    marzo: 3,
    mar: 3,
    abril: 4,
    abr: 4,
    mayo: 5,
    may: 5,
    junio: 6,
    jun: 6,
    julio: 7,
    jul: 7,
    agosto: 8,
    ago: 8,
    septiembre: 9,
    setiembre: 9,
    sep: 9,
    set: 9,
    octubre: 10,
    oct: 10,
    noviembre: 11,
    nov: 11,
    diciembre: 12,
    dic: 12,
  };

  const words = text.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+de\s+(\d{4}))?\b/);
  if (!words) return null;

  const day = Number.parseInt(words[1], 10);
  const month = months[words[2]];
  if (!month || day < 1 || day > 31) return null;

  const currentYear = Number.parseInt(
    new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Bogota" }).format(new Date()),
    10
  );
  let year = words[3] ? Number.parseInt(words[3], 10) : currentYear;
  const todayMonth = Number.parseInt(
    new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Bogota" }).format(new Date()),
    10
  );
  if (!words[3] && month > todayMonth) year = currentYear - 1;

  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { key, day, month, year };
}

export function extractProductHint(input: string) {
  const text = normalizeQuery(input);
  const match = text.match(/(?:de|del)\s+([a-z0-9\s-]{2,})$/i);
  if (!match) return "";

  const candidate = match[1]
    .replace(/\b(producto|sku)\b/g, "")
    .trim();

  const blocked = new Set(["ayer", "hoy", "mes", "venta", "ventas", "reporte", "reportes"]);
  if (!candidate || blocked.has(candidate)) return "";
  return candidate;
}

export function extractProductCode(input: string) {
  const raw = input.trim();

  const directCode = raw.match(/(?:sku|codigo|código)\s*[:#-]?\s*([a-z0-9._-]{3,})/i);
  if (directCode?.[1]) return directCode[1].trim();

  const byProductNumber = raw.match(/\b(?:producto|prod|item|articulo|artículo)\s*[:#-]?\s*(\d{1,9})\b/i);
  if (byProductNumber?.[1]) return byProductNumber[1].trim();

  const plainNumeric = raw.match(/^\d{1,9}$/);
  if (plainNumeric?.[0]) return plainNumeric[0];

  const trailingNumber = raw.match(/\b(\d{1,9})\b\s*$/);
  if (
    trailingNumber?.[1] &&
    /\b(cual|cuál|que|qué|producto|sku|codigo|código|buscar|mostrar|dime)\b/i.test(raw) &&
    !/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(raw)
  ) {
    return trailingNumber[1].trim();
  }

  const inQuotes = raw.match(/["“]([^"”]{2,})["”]/);
  if (inQuotes?.[1]) return inQuotes[1].trim();
  return "";
}

export function extractProductTerm(input: string) {
  const normalized = normalizeQuery(input);

  const beforeSold = normalized.match(/ultima\s+(.+?)\s+que\s+vend/i);
  if (beforeSold?.[1]) {
    const candidate = beforeSold[1].trim();
    if (candidate) return candidate;
  }

  const byDe = normalized.match(/(?:de|del|producto)\s+([a-z0-9\s._-]{2,})$/i);
  if (byDe?.[1]) return byDe[1].trim();

  const afterSold = normalized.match(/vend(?:i|io|imos)\s+([a-z0-9\s._-]{2,})$/i);
  if (afterSold?.[1]) {
    const candidate = afterSold[1].replace(/\b(hoy|ayer|anteayer|este|ese|mes|ano|año)\b/g, "").trim();
    if (candidate) return candidate;
  }

  const stopwords = new Set([
    "cual",
    "cuál",
    "cuales",
    "cuáles",
    "que",
    "qué",
    "como",
    "cómo",
    "cuanto",
    "cuánto",
    "cuantos",
    "cuántos",
    "fue",
    "fueron",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "de",
    "del",
    "al",
    "en",
    "por",
    "para",
    "con",
    "venta",
    "ventas",
    "vendimos",
    "vendi",
    "vendio",
    "vendió",
    "ultima",
    "última",
    "ultimo",
    "último",
    "vez",
    "producto",
    "productos",
    "grupo",
    "codigo",
    "código",
    "sku",
    "hoy",
    "ayer",
    "mes",
    "dia",
    "día",
    "tenemos",
    "tenemo",
    "tengo",
    "hay",
    "tal",
  ]);

  const lexicalTokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopwords.has(token))
    .map((token) => {
      if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
      return token;
    });

  if (!lexicalTokens.length) return "";
  return lexicalTokens.slice(0, 3).join(" ");
}
