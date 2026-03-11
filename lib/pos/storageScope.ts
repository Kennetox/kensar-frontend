export type PosStorageScope = {
  tenantId?: number | null;
  userId?: number | null;
  stationId?: string | null;
};

function normalizeSegment(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "na";
}

export function buildPosStorageScope(scope: PosStorageScope): string {
  const tenant =
    typeof scope.tenantId === "number" && Number.isFinite(scope.tenantId)
      ? String(scope.tenantId)
      : "na";
  const user =
    typeof scope.userId === "number" && Number.isFinite(scope.userId)
      ? String(scope.userId)
      : "na";
  const station = normalizeSegment(scope.stationId ?? "na");
  return `t:${tenant}|u:${user}|s:${station}`;
}

export function buildScopedPosStorageKey(
  baseKey: string,
  scope: PosStorageScope
): string {
  return `${baseKey}:${buildPosStorageScope(scope)}`;
}
