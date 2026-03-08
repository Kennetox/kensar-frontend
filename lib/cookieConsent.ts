export const COOKIE_CONSENT_COOKIE_NAME = "metrik_cookie_consent";

export type CookieConsentValue = "essential" | "all";

const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function parseCookieConsent(value?: string | null): CookieConsentValue | null {
  if (value === "essential" || value === "all") return value;
  return null;
}

export function buildCookieConsentCookie(value: CookieConsentValue) {
  return `${COOKIE_CONSENT_COOKIE_NAME}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function clearCookieConsentCookie() {
  return `${COOKIE_CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
