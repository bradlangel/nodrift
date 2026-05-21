const getExtensionRootUrl = (): URL | null => {
  try {
    return new URL(chrome.runtime.getURL(""));
  } catch {
    return null;
  }
};

export type ExtensionRuntimeFamily = "chrome" | "firefox" | "unknown";

export type ExtensionStoreListing = {
  label: string;
  url: string;
};

const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/hnehakhgloffpelfgleecfknkpkomhhl";
const FIREFOX_ADDONS_URL: string | null = null;

export const getExtensionRuntimeFamily = (): ExtensionRuntimeFamily => {
  const extensionRootUrl = getExtensionRootUrl();
  if (extensionRootUrl?.protocol === "moz-extension:") return "firefox";
  if (extensionRootUrl?.protocol === "chrome-extension:") return "chrome";
  return "unknown";
};

export const isChromeLocalAiSupportedBrowser = (): boolean =>
  getExtensionRuntimeFamily() !== "firefox";

export const getExtensionStoreListing = (): ExtensionStoreListing | null => {
  const runtime = getExtensionRuntimeFamily();
  if (runtime === "firefox") {
    return FIREFOX_ADDONS_URL === null
      ? null
      : { label: "Firefox Add-ons", url: FIREFOX_ADDONS_URL };
  }
  return { label: "Chrome Web Store", url: CHROME_WEB_STORE_URL };
};

export const getDnrExtensionRedirectTransformBase = (): {
  scheme: string;
  host: string;
} => {
  const extensionRootUrl = getExtensionRootUrl();
  return {
    scheme: extensionRootUrl?.protocol.replace(/:$/, "") || "chrome-extension",
    host: extensionRootUrl?.host || chrome.runtime.id,
  };
};

export const DNR_ACTION_ALLOW = "allow";
export const DNR_ACTION_REDIRECT = "redirect";
export const DNR_RESOURCE_MAIN_FRAME = "main_frame";

export const isExtensionPageUrl = (rawUrl?: string | null): boolean => {
  if (!rawUrl) return false;

  const extensionRootUrl = getExtensionRootUrl();
  if (!extensionRootUrl) {
    return rawUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`);
  }

  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === extensionRootUrl.protocol &&
      url.host === extensionRootUrl.host
    );
  } catch {
    return false;
  }
};
