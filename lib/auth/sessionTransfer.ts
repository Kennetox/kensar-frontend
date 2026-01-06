export const AUTH_TRANSFER_STORAGE_KEY = "kensar_auth_transfer_v1";
const AUTH_TRANSFER_TTL_MS = 10 * 1000; // 10 segundos

type AuthTransferPayload<UserShape> = {
  token: string;
  user: UserShape;
};

type StoredSnapshot<UserShape> = AuthTransferPayload<UserShape> & {
  expiresAt: number;
};

export function stageAuthTransferSnapshot<UserShape>(
  payload: AuthTransferPayload<UserShape>
) {
  if (typeof window === "undefined") return;
  try {
    const snapshot: StoredSnapshot<UserShape> = {
      ...payload,
      expiresAt: Date.now() + AUTH_TRANSFER_TTL_MS,
    };
    window.localStorage.setItem(
      AUTH_TRANSFER_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  } catch (err) {
    console.warn("No se pudo preparar la sesión para otra pestaña", err);
  }
}

export function consumeAuthTransferSnapshot<UserShape>() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_TRANSFER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot<UserShape>;
    const isValid =
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.token === "string" &&
      parsed.user &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt >= Date.now();
    window.localStorage.removeItem(AUTH_TRANSFER_STORAGE_KEY);
    if (!isValid) {
      return null;
    }
    return {
      token: parsed.token,
      user: parsed.user as UserShape,
    };
  } catch (err) {
    console.warn("No se pudo restaurar la sesión compartida", err);
    return null;
  }
}
