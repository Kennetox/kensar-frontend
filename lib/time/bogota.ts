export const BOGOTA_TIME_ZONE = "America/Bogota";

type DateInput = string | number | Date | null | undefined;

const HAS_TIMEZONE_REGEX = /([zZ]|[+-]\d{2}:\d{2})$/;

const normalizeDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.includes("T")) return trimmed;
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return trimmed;
  return `${trimmed.slice(0, spaceIndex)}T${trimmed.slice(spaceIndex + 1)}`;
};

export const parseDateInput = (value: DateInput): Date | null => {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const withTz = HAS_TIMEZONE_REGEX.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const date = new Date(withTz);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getBogotaDateParts = (value: DateInput = new Date()) => {
  const date = parseDateInput(value) ?? new Date();
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOGOTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const result: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  });
  return {
    year: result.year ?? "0000",
    month: result.month ?? "01",
    day: result.day ?? "01",
    hour: result.hour ?? "00",
    minute: result.minute ?? "00",
    second: result.second ?? "00",
  };
};

export const getBogotaDateKey = (value?: DateInput) => {
  const { year, month, day } = getBogotaDateParts(value);
  return `${year}-${month}-${day}`;
};

export const buildBogotaDateFromKey = (key: string) => {
  const [yearRaw, monthRaw, dayRaw] = key.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return new Date();
  }
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
};

export const formatBogotaDate = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions
) => {
  const date = parseDateInput(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TIME_ZONE,
    ...options,
  }).format(date);
};
