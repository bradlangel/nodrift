import { getExtensionRuntimeFamily } from "./browser-compat.js";

export type FirefoxDataCollectionPermission =
  | "authenticationInfo"
  | "bookmarksInfo"
  | "browsingActivity"
  | "financialAndPaymentInfo"
  | "healthInfo"
  | "locationInfo"
  | "personalCommunications"
  | "personallyIdentifyingInfo"
  | "searchTerms"
  | "technicalAndInteraction"
  | "websiteActivity"
  | "websiteContent";

export const FIREFOX_OPENAI_AUTH_DATA_COLLECTION_PERMISSIONS = [
  "authenticationInfo",
] as const satisfies readonly FirefoxDataCollectionPermission[];

export const FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS = [
  "authenticationInfo",
  "browsingActivity",
  "technicalAndInteraction",
] as const satisfies readonly FirefoxDataCollectionPermission[];

export const FIREFOX_PEEK_CHATGPT_DATA_COLLECTION_PERMISSIONS = [
  "browsingActivity",
  "websiteContent",
] as const satisfies readonly FirefoxDataCollectionPermission[];

export const FIREFOX_OPTIONAL_PROVIDER_DATA_COLLECTION_PERMISSIONS = [
  "authenticationInfo",
  "browsingActivity",
  "technicalAndInteraction",
  "websiteContent",
] as const satisfies readonly FirefoxDataCollectionPermission[];

type PermissionsApiResult = {
  data_collection?: string[];
};

const getRuntimeLastErrorMessage = (): string | null => {
  try {
    return chrome.runtime?.lastError?.message || null;
  } catch {
    return null;
  }
};

const callPermissionsApi = <T>(
  methodName: "getAll" | "request",
  details?: Record<string, unknown>
): Promise<T> =>
  new Promise((resolve, reject) => {
    const permissionsApi = chrome.permissions;
    const method = permissionsApi?.[methodName];
    if (typeof method !== "function") {
      reject(new Error("Firefox data-sharing permission API is unavailable."));
      return;
    }

    let settled = false;
    const settle = (resolveResult: boolean, value: T | Error) => {
      if (settled) return;
      settled = true;
      if (resolveResult) {
        resolve(value as T);
      } else {
        reject(value);
      }
    };

    const callback = (value: T) => {
      const lastError = getRuntimeLastErrorMessage();
      if (lastError) {
        settle(false, new Error(lastError));
        return;
      }
      settle(true, value);
    };

    try {
      const maybePromise =
        details === undefined
          ? method.call(permissionsApi, callback)
          : method.call(permissionsApi, details, callback);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(
          (value: T) => settle(true, value),
          (error: unknown) =>
            settle(
              false,
              error instanceof Error ? error : new Error(String(error))
            )
        );
      }
    } catch (error) {
      settle(false, error instanceof Error ? error : new Error(String(error)));
    }
  });

const normalizeDataCollectionPermissions = (
  permissions: readonly FirefoxDataCollectionPermission[]
): FirefoxDataCollectionPermission[] => [...new Set(permissions)];

export const ensureFirefoxDataCollectionConsent = async (
  permissions: readonly FirefoxDataCollectionPermission[],
  featureLabel: string
): Promise<void> => {
  const requestedPermissions = normalizeDataCollectionPermissions(permissions);
  if (requestedPermissions.length === 0) return;
  if (getExtensionRuntimeFamily() !== "firefox") return;

  const currentPermissions =
    await callPermissionsApi<PermissionsApiResult>("getAll");
  if (!Array.isArray(currentPermissions.data_collection)) {
    throw new Error(
      "Firefox data-sharing controls are unavailable. Update Firefox to 142 or later before using this external provider feature."
    );
  }

  const grantedPermissions = new Set(currentPermissions.data_collection);
  const missingPermissions = requestedPermissions.filter(
    (permission) => !grantedPermissions.has(permission)
  );
  if (missingPermissions.length === 0) return;

  const granted = await callPermissionsApi<boolean>("request", {
    data_collection: missingPermissions,
  });
  if (!granted) {
    throw new Error(
      `Firefox did not grant data sharing for ${featureLabel}, so NoDrift did not send data to an external provider.`
    );
  }
};
