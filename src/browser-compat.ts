const getExtensionRootUrl = (): URL | null => {
  try {
    return new URL(chrome.runtime.getURL(""));
  } catch {
    return null;
  }
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
