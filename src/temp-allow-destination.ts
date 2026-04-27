import { hostMatchesSite } from "./site-matching.js";
import {
  ensureHttpUrl,
  parseHostnameFromUrl,
  parseSiteFromSender,
  parseSiteFromUrl,
} from "./url-domain.js";

export type TemporarilyAllowDestinationPayload = {
  url?: string | null;
  tabId?: number | null;
};

type DestinationDependencies = {
  getLedgerUrl: (tabId: number) => string | null;
  getTabNavigatedHttpUrl: (tabId: number) => Promise<string | null>;
};

const httpUrlMatchesSite = (
  rawUrl?: string | null,
  site?: string | null
): boolean => {
  const host = parseHostnameFromUrl(rawUrl);
  return hostMatchesSite(host, site);
};

export const getTemporarilyAllowedDestination = async (
  payload: TemporarilyAllowDestinationPayload,
  sender: any,
  dependencies: DestinationDependencies
): Promise<string | null> => {
  const tabId =
    typeof payload.tabId === "number"
      ? payload.tabId
      : typeof sender?.tab?.id === "number"
      ? sender.tab.id
      : null;
  const site = parseSiteFromUrl(payload.url) || parseSiteFromSender(sender);
  const ledgerUrl = tabId !== null ? dependencies.getLedgerUrl(tabId) : null;
  if (httpUrlMatchesSite(ledgerUrl, site)) return ledgerUrl;

  const tabNavigationUrl =
    tabId !== null ? await dependencies.getTabNavigatedHttpUrl(tabId) : null;
  if (httpUrlMatchesSite(tabNavigationUrl, site)) return tabNavigationUrl;

  return site ? ensureHttpUrl(`https://${site}`) : null;
};
