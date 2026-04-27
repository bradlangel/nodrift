import { normalizeHost } from "./url-domain.js";

export const hostMatchesSite = (
  host?: string | null,
  site?: string | null
): boolean => {
  const normalizedHost = normalizeHost(host);
  const normalizedSite = normalizeHost(site);
  if (!normalizedHost || !normalizedSite) return false;
  return (
    normalizedHost === normalizedSite ||
    normalizedHost.endsWith(`.${normalizedSite}`)
  );
};

export const findRuleIdByHostname = (
  host: string,
  blockedSites: string[]
): number | null => {
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < blockedSites.length; i++) {
    const site = blockedSites[i];
    if (hostMatchesSite(host, site) && site.length > bestLen) {
      bestLen = site.length;
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? null : bestIdx + 1;
};

export const getRelatedRuleIdsForHost = (
  host: string,
  blockedSites: string[]
): number[] => {
  const parts = host.split(".");
  const base = parts.slice(-2).join(".");
  const ids: number[] = [];
  for (let i = 0; i < blockedSites.length; i++) {
    const site = blockedSites[i];
    if (site === host || site === base || site.endsWith(`.${base}`)) {
      ids.push(i + 1);
    }
  }
  return ids;
};
