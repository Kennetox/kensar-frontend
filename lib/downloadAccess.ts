import crypto from "node:crypto";

const ACCESS_COOKIE_NAME = "metrik_download_access";
const ACCESS_TTL_SECONDS = 60 * 60 * 24;

type AccessPayload = {
  exp: number;
};

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getAccessSecret() {
  return process.env.DOWNLOAD_ACCESS_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export function getDownloadAccessConfig() {
  const fromSingle = process.env.DOWNLOAD_ACCESS_CODE?.trim() ?? "";
  const fromList =
    process.env.DOWNLOAD_ACCESS_CODES
      ?.split(",")
      .map((code) => code.trim())
      .filter(Boolean) ?? [];

  const codes = fromSingle ? [fromSingle, ...fromList] : fromList;
  const uniqueCodes = [...new Set(codes)];

  return {
    codes: uniqueCodes,
    hasCodes: uniqueCodes.length > 0,
    hasSecret: Boolean(getAccessSecret()),
  };
}

export function createDownloadAccessToken() {
  const secret = getAccessSecret();
  if (!secret) return null;

  const payload: AccessPayload = {
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyDownloadAccessToken(token?: string | null) {
  if (!token) return false;

  const secret = getAccessSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return false;

  const expectedSignature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");

  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AccessPayload;
    return Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function matchesDownloadCode(rawCode: string) {
  const code = rawCode.trim();
  if (!code) return false;

  const { codes } = getDownloadAccessConfig();
  return codes.some((allowedCode) => {
    const input = Buffer.from(code);
    const allowed = Buffer.from(allowedCode);
    return input.length === allowed.length && crypto.timingSafeEqual(input, allowed);
  });
}

export const DOWNLOAD_ACCESS_COOKIE_NAME = ACCESS_COOKIE_NAME;
export const DOWNLOAD_ACCESS_COOKIE_MAX_AGE = ACCESS_TTL_SECONDS;
