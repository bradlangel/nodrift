export const normalizeHost = (host?: string | null): string | null => {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  return trimmed || null;
};

export const ensureHttpUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    try {
      const normalised = trimmed.replace(/^https?:\/\//, "");
      if (!normalised) return null;
      const parsed = new URL(`https://${normalised}`);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const parseHostnameFromUrl = (rawUrl?: string | null): string | null => {
  const ensured = ensureHttpUrl(rawUrl);
  if (!ensured) return null;
  try {
    return new URL(ensured).hostname.toLowerCase();
  } catch {
    return null;
  }
};

export const sanitizeSite = (value?: string | null): string | null => {
  if (!value) return null;
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

export const parseSiteFromUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl) return null;
  try {
    return sanitizeSite(new URL(rawUrl).searchParams.get("site"));
  } catch {
    return null;
  }
};

export const parseSiteFromSender = (sender?: any): string | null => {
  if (!sender?.url) return null;
  try {
    const u = new URL(sender.url);
    return u.searchParams.get("site");
  } catch (err) {
    console.warn("Failed to parse sender site", err);
    return null;
  }
};
