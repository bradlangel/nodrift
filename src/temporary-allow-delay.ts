export const TEMPORARY_ALLOW_DELAY_BASE_SECONDS = 5;
export const TEMPORARY_ALLOW_DELAY_MAX_SECONDS = 60;

export type PendingTemporaryAllowDelay = {
  dayKey: string;
  targetKey: string;
  allowCountToday: number;
  readyAt: number;
};

export type TemporaryAllowDelayEvaluation =
  | {
      status: "ready";
      allowCountToday: number;
      delaySeconds: number;
      pending: PendingTemporaryAllowDelay | null;
    }
  | {
      status: "waiting";
      allowCountToday: number;
      delaySeconds: number;
      remainingSeconds: number;
      readyAt: number;
      pending: PendingTemporaryAllowDelay;
    };

const normalizeNonNegativeInteger = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(Math.floor(value), 0)
    : 0;

export const getGlobalTemporaryAllowDelaySeconds = (
  successfulAllowsToday: unknown
): number => {
  const allowCountToday = normalizeNonNegativeInteger(successfulAllowsToday);
  if (allowCountToday === 0) return 0;
  return Math.min(
    TEMPORARY_ALLOW_DELAY_BASE_SECONDS * 2 ** (allowCountToday - 1),
    TEMPORARY_ALLOW_DELAY_MAX_SECONDS
  );
};

export const normalizePendingTemporaryAllowDelay = (
  value: unknown
): PendingTemporaryAllowDelay | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<PendingTemporaryAllowDelay>;
  if (
    typeof maybe.dayKey !== "string" ||
    !maybe.dayKey ||
    typeof maybe.targetKey !== "string" ||
    !maybe.targetKey ||
    typeof maybe.allowCountToday !== "number" ||
    !Number.isFinite(maybe.allowCountToday) ||
    maybe.allowCountToday < 0 ||
    typeof maybe.readyAt !== "number" ||
    !Number.isFinite(maybe.readyAt)
  ) {
    return null;
  }
  return {
    dayKey: maybe.dayKey,
    targetKey: maybe.targetKey,
    allowCountToday: Math.floor(maybe.allowCountToday),
    readyAt: maybe.readyAt,
  };
};

export const evaluateTemporaryAllowDelay = ({
  enabled,
  successfulAllowsToday,
  dayKey,
  targetKey,
  pending,
  now = Date.now(),
}: {
  enabled: boolean;
  successfulAllowsToday: unknown;
  dayKey: string;
  targetKey: string;
  pending?: unknown;
  now?: number;
}): TemporaryAllowDelayEvaluation => {
  const allowCountToday = normalizeNonNegativeInteger(successfulAllowsToday);
  const delaySeconds = enabled
    ? getGlobalTemporaryAllowDelaySeconds(allowCountToday)
    : 0;
  if (delaySeconds === 0) {
    return {
      status: "ready",
      allowCountToday,
      delaySeconds,
      pending: null,
    };
  }

  const normalizedPending = normalizePendingTemporaryAllowDelay(pending);
  const matchingPending =
    normalizedPending?.dayKey === dayKey &&
    normalizedPending.targetKey === targetKey &&
    normalizedPending.allowCountToday === allowCountToday
      ? normalizedPending
      : null;
  const activePending: PendingTemporaryAllowDelay =
    matchingPending ?? {
      dayKey,
      targetKey,
      allowCountToday,
      readyAt: now + delaySeconds * 1000,
    };
  const remainingSeconds = Math.max(
    Math.ceil((activePending.readyAt - now) / 1000),
    0
  );

  if (remainingSeconds === 0) {
    return {
      status: "ready",
      allowCountToday,
      delaySeconds,
      pending: activePending,
    };
  }

  return {
    status: "waiting",
    allowCountToday,
    delaySeconds,
    remainingSeconds,
    readyAt: activePending.readyAt,
    pending: activePending,
  };
};

export const buildTemporaryAllowDelayTargetKey = ({
  scope,
  host,
  url,
}: {
  scope: string;
  host?: string | null;
  url?: string | null;
}): string =>
  scope === "url" && url ? `url:${url}` : `domain:${host || "unknown"}`;
