const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

let blockedSites = [...DEFAULT_BLOCKED_SITES];
let tempAllowMinutes: number | null = null;

const DEFAULT_GRAYSCALE_ON_TEMP_ALLOW = true;
let grayscaleOnTemporaryAllow = DEFAULT_GRAYSCALE_ON_TEMP_ALLOW;

const GRAYSCALE_STORAGE_KEY = "temporarilyAllowedGrayscaleHosts";
const GRAYSCALE_CSS = "html { filter: grayscale(1) !important; }";
const grayscaleHosts = new Map<string, number>();

const normalizeHost = (host?: string | null): string | null => {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  return trimmed || null;
};

const EXTENSION_URL_PREFIX = `chrome-extension://${chrome.runtime.id}/`;
const lastNavigatedUrlByTab = new Map<number, string>();

const ensureHttpUrl = (value?: string | null): string | null => {
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

const recordLastNavigatedUrl = (tabId: number, rawUrl?: string | null) => {
  if (rawUrl && rawUrl.startsWith(EXTENSION_URL_PREFIX)) {
    return;
  }
  const normalised = ensureHttpUrl(rawUrl);
  if (!normalised) return;
  lastNavigatedUrlByTab.set(tabId, normalised);
};

const getTabNavigatedHttpUrl = (tabId: number): Promise<string | null> =>
  new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab: any) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "getTabNavigatedHttpUrl tabs.get failed",
          chrome.runtime.lastError.message
        );
        resolve(null);
        return;
      }

      const pending = ensureHttpUrl(tab?.pendingUrl);
      if (pending) {
        resolve(pending);
        return;
      }

      const current = ensureHttpUrl(tab?.url);
      resolve(current);
    });
  });

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab?: any) => {
  if (changeInfo?.pendingUrl) {
    recordLastNavigatedUrl(tabId, changeInfo.pendingUrl);
  }
  if (changeInfo?.url) {
    recordLastNavigatedUrl(tabId, changeInfo.url);
    return;
  }
  if (changeInfo?.status === "complete" && tab?.url) {
    recordLastNavigatedUrl(tabId, tab.url);
    return;
  }
  if (!changeInfo?.status && tab?.url) {
    recordLastNavigatedUrl(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  lastNavigatedUrlByTab.delete(tabId);
});

if (chrome.webNavigation?.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((details: any) => {
    if (details?.frameId !== 0) return;
    recordLastNavigatedUrl(details.tabId, details.url);
  });
}

if (chrome.webNavigation?.onCommitted) {
  chrome.webNavigation.onCommitted.addListener((details: any) => {
    if (details?.frameId !== 0) return;
    recordLastNavigatedUrl(details.tabId, details.url);
    maybeApplyGrayscaleForUrl(details.tabId, details.url);
  });
}

if (chrome.webNavigation?.onCompleted) {
  chrome.webNavigation.onCompleted.addListener((details: any) => {
    if (details?.frameId !== 0) return;
    maybeApplyGrayscaleForUrl(details.tabId, details.url);
  });
}

const getTempAllowMinutes = (): Promise<number> =>
  new Promise((resolve) => {
    if (tempAllowMinutes !== null) {
      resolve(tempAllowMinutes);
    } else {
      chrome.storage.sync.get({ tempAllowMinutes: 30 }, (data) => {
        tempAllowMinutes = data.tempAllowMinutes;
        resolve(tempAllowMinutes);
      });
    }
  });

// ---------- Rule builder ----------

const buildRule = (
  site: string,
  id: number
): any => ({
  id,
  // Give more specific domains higher priority so subdomains override their base domain.
  priority: site.split(".").length,
  action: {
    type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
    // Use transform so we can attach query params identifying the rule+site.
    redirect: {
      transform: {
        scheme: "chrome-extension",
        host: chrome.runtime.id,
        path: "/block.html",
        queryTransform: {
          addOrReplaceParams: [
            { key: "rid", value: String(id) },
            { key: "site", value: site },
          ],
        },
      },
    },
  },
  condition: {
    // Match at the domain boundary (handles subdomains properly).
    urlFilter: `||${site}^`,
    resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
  },
});

const buildRules = (sites: string[]): any[] =>
  sites.map((site, idx) => buildRule(site, idx + 1));

const allRuleIds = () => blockedSites.map((_, idx) => idx + 1);

// ---------- Utilities ----------

console.log("Website blocker: Service Worker Loaded");

const findRuleIdByHostname = (host: string): number | null => {
  // Pick the most specific matching entry (longest match), so subdomain beats base.
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < blockedSites.length; i++) {
    const site = blockedSites[i];
    if (host === site || host.endsWith("." + site)) {
      if (site.length > bestLen) {
        bestLen = site.length;
        bestIdx = i;
      }
    }
  }
  return bestIdx === -1 ? null : bestIdx + 1;
};

const withLastErrorLog =
  (label: string, next?: () => void) =>
  () => {
    if (chrome.runtime.lastError) {
      console.warn(`[${label}]`, chrome.runtime.lastError.message);
    }
    next?.();
  };

const grayscaleStorageGet = (
  defaults: Record<string, unknown>,
  callback: (items: Record<string, unknown>) => void
) => {
  if (chrome.storage?.session?.get) {
    chrome.storage.session.get(defaults, callback);
  } else {
    chrome.storage.local.get(defaults, callback);
  }
};

const grayscaleStorageSet = (
  items: Record<string, unknown>,
  callback?: () => void
) => {
  if (chrome.storage?.session?.set) {
    chrome.storage.session.set(items, callback);
  } else {
    chrome.storage.local.set(items, callback);
  }
};

const persistGrayscaleHosts = () => {
  const entries = Array.from(grayscaleHosts.entries());
  grayscaleStorageSet({ [GRAYSCALE_STORAGE_KEY]: entries });
};

const syncGrayscaleForUrl = (tabId: number, rawUrl?: string | null) => {
  const ensured = ensureHttpUrl(rawUrl);
  if (!ensured) return;

  let host: string;
  try {
    host = new URL(ensured).hostname.toLowerCase();
  } catch {
    return;
  }

  const now = Date.now();
  let shouldApply = false;
  for (const [storedHost, expiresAt] of grayscaleHosts.entries()) {
    if (expiresAt <= now) continue;
    if (host === storedHost || host.endsWith(`.${storedHost}`)) {
      shouldApply = true;
      break;
    }
  }

  if (!chrome.scripting) return;
  const target = { tabId, allFrames: true };

  if (shouldApply && chrome.scripting.insertCSS) {
    chrome.scripting.insertCSS(
      { target, css: GRAYSCALE_CSS },
      withLastErrorLog("insertCSS(grayscale)")
    );
    return;
  }

  if (!shouldApply && chrome.scripting.removeCSS) {
    chrome.scripting.removeCSS(
      { target, css: GRAYSCALE_CSS },
      withLastErrorLog("removeCSS(grayscale)")
    );
  }
};

const syncGrayscaleForHostTabs = (host: string) => {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ url: [`*://${host}/*`, `*://*.${host}/*`] }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.warn("[tabs.query(sync grayscale)]", chrome.runtime.lastError.message);
      return;
    }
    tabs.forEach((tab) => {
      if (typeof tab.id === "number") {
        syncGrayscaleForUrl(tab.id, tab.url);
      }
    });
  });
};

const removeGrayscaleFromAllTabs = () => {
  if (!chrome.tabs?.query || !chrome.scripting?.removeCSS) return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (typeof tab.id !== "number") return;
      chrome.scripting?.removeCSS?.(
        { target: { tabId: tab.id, allFrames: true }, css: GRAYSCALE_CSS },
        withLastErrorLog("removeCSS(grayscale all tabs)")
      );
    });
  });
};

const pruneExpiredGrayscaleHosts = () => {
  const now = Date.now();
  let changed = false;
  for (const [host, expiresAt] of grayscaleHosts.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      grayscaleHosts.delete(host);
      syncGrayscaleForHostTabs(host);
      changed = true;
    }
  }
  if (changed) {
    persistGrayscaleHosts();
  }
};

const scheduleGrayscaleForHosts = (hosts: string[], minutes: number) => {
  if (!grayscaleOnTemporaryAllow) return;
  if (hosts.length === 0) return;
  pruneExpiredGrayscaleHosts();
  const normalizedMinutes = Number.isFinite(minutes) ? Math.max(minutes, 1) : 1;
  const durationMs = normalizedMinutes * 60 * 1000;
  const expiresAt = Date.now() + durationMs;
  let changed = false;
  for (const rawHost of hosts) {
    const host = normalizeHost(rawHost);
    if (!host) continue;
    const existing = grayscaleHosts.get(host) ?? 0;
    if (existing < expiresAt) {
      grayscaleHosts.set(host, expiresAt);
      changed = true;
    }
    syncGrayscaleForHostTabs(host);
  }
  if (changed) {
    persistGrayscaleHosts();
  }
};

const clearGrayscaleHosts = () => {
  const hadHosts = grayscaleHosts.size > 0;
  grayscaleHosts.clear();
  if (hadHosts) {
    persistGrayscaleHosts();
  } else {
    grayscaleStorageSet({ [GRAYSCALE_STORAGE_KEY]: [] });
  }
  removeGrayscaleFromAllTabs();
};

const loadGrayscalePreference = () => {
  chrome.storage.sync.get(
    { grayscaleOnTemporaryAllow: DEFAULT_GRAYSCALE_ON_TEMP_ALLOW },
    (data) => {
      grayscaleOnTemporaryAllow = Boolean(data.grayscaleOnTemporaryAllow);
      if (!grayscaleOnTemporaryAllow) {
        clearGrayscaleHosts();
      }
    }
  );
};

const loadGrayscaleHosts = () => {
  grayscaleStorageGet({ [GRAYSCALE_STORAGE_KEY]: [] }, (items) => {
    const rawEntries = Array.isArray(items?.[GRAYSCALE_STORAGE_KEY])
      ? (items[GRAYSCALE_STORAGE_KEY] as unknown[])
      : [];
    grayscaleHosts.clear();
    const now = Date.now();
    let changed = false;
    for (const entry of rawEntries) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        changed = true;
        continue;
      }
      const [rawHost, expiresAt] = entry as [unknown, unknown];
      const host = normalizeHost(typeof rawHost === "string" ? rawHost : null);
      if (!host || typeof expiresAt !== "number") {
        changed = true;
        continue;
      }
      if (expiresAt > now) {
        grayscaleHosts.set(host, expiresAt);
      } else {
        changed = true;
      }
    }
    if (changed) {
      persistGrayscaleHosts();
    }
  });
};

const maybeApplyGrayscaleForUrl = (tabId: number, rawUrl?: string | null) => {
  if (!grayscaleOnTemporaryAllow) return;
  pruneExpiredGrayscaleHosts();
  syncGrayscaleForUrl(tabId, rawUrl);
};

const refreshRules = () => {
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    const ids = rules.map((r) => r.id);
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: ids, addRules: buildRules(blockedSites) },
      withLastErrorLog("refreshRules")
    );
  });
};

const loadBlockedSites = () => {
  chrome.storage.sync.get({ blockedSites: DEFAULT_BLOCKED_SITES }, (data) => {
    blockedSites = data.blockedSites;

    chrome.storage.local.get({ cachedBlockedSites: null }, (cache) => {
      const cached = cache.cachedBlockedSites;
      const changed =
        !cached || JSON.stringify(cached) !== JSON.stringify(blockedSites);
      if (changed) {
        refreshRules();
        chrome.storage.local.set({ cachedBlockedSites: blockedSites });
      }
    });
  });
};

loadBlockedSites();
getTempAllowMinutes();
loadGrayscalePreference();
loadGrayscaleHosts();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.blockedSites) {
      blockedSites = changes.blockedSites.newValue;
      refreshRules();
      chrome.storage.local.set({ cachedBlockedSites: blockedSites });
    }
    if (changes.tempAllowMinutes) {
      tempAllowMinutes = changes.tempAllowMinutes.newValue;
    }
    if (changes.grayscaleOnTemporaryAllow) {
      grayscaleOnTemporaryAllow = Boolean(
        changes.grayscaleOnTemporaryAllow.newValue
      );
      if (!grayscaleOnTemporaryAllow) {
        clearGrayscaleHosts();
      }
    }
  }
});

// Temporarily allow one or more rules (removes rules & sets timers to restore).
const allowRulesTemporarily = (ids: number[], minutes: number) => {
  if (ids.length === 0) return;
  const hostsForIds = ids
    .map((id) => blockedSites[id - 1])
    .filter((host): host is string => typeof host === "string" && !!host);
  scheduleGrayscaleForHosts(hostsForIds, minutes);
  chrome.declarativeNetRequest.updateDynamicRules(
    { removeRuleIds: ids },
    withLastErrorLog("removeRuleIds")
  );
  ids.forEach((id) =>
    chrome.alarms.create(`restore-${id}`, { delayInMinutes: minutes })
  );
};

// Temporarily allow a hostname and any related rules (base domain + subdomains).
const temporarilyAllow = async (host: string, minutes?: number) => {
  const mins = minutes ?? (await getTempAllowMinutes());
  const parts = host.split(".");
  const base = parts.slice(-2).join(".");
  const ids: number[] = [];
  for (let i = 0; i < blockedSites.length; i++) {
    const site = blockedSites[i];
    if (site === host || site === base || site.endsWith("." + base)) {
      ids.push(i + 1);
    }
  }
  allowRulesTemporarily(ids, mins);
};

// Entry point when we only know the rule id (e.g., from the block page).
const temporarilyAllowById = async (id: number, minutes?: number) => {
  const site = blockedSites[id - 1];
  if (!site) return;
  await temporarilyAllow(site, minutes);
};

// Re-add a specific rule immediately and refresh the current tab so it takes effect.
const restoreNowById = (id: number, tabId?: number, currentUrl?: string) => {
  chrome.alarms.clear(`restore-${id}`);
  const site = blockedSites[id - 1];
  if (!site) return;
  const normalizedHost = normalizeHost(site);
  if (normalizedHost && grayscaleHosts.has(normalizedHost)) {
    grayscaleHosts.delete(normalizedHost);
    persistGrayscaleHosts();
    syncGrayscaleForHostTabs(normalizedHost);
  }

  chrome.declarativeNetRequest.updateDynamicRules(
    { addRules: [buildRule(site, id)] },
    withLastErrorLog("addRules(re-add one)", () => {
      if (!tabId) return;
      // If we were on the allowed site, navigate to it again to trigger the block;
      // if we're on the block page already, just reload.
      const isExtensionUrl =
        typeof currentUrl === "string" &&
        currentUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`);

      if (currentUrl && !isExtensionUrl) {
        chrome.tabs.update(tabId, { url: currentUrl });
      } else {
        chrome.tabs.reload(tabId);
      }
    })
  );
};

// NEW: Re-block ALL sites — clears alarms, clears session storage, and atomically resets every rule.
const reblockAllNow = (tabId?: number, currentUrl?: string) => {
  clearGrayscaleHosts();
  chrome.alarms.clearAll(
    withLastErrorLog("alarms.clearAll", () => {
      // Best-effort: clear any session storage keys we may have used.
      if (chrome.storage?.session?.clear) {
        chrome.storage.session.clear(
          withLastErrorLog("storage.session.clear", () => resetAllRulesAndReload(tabId, currentUrl))
        );
      } else {
        resetAllRulesAndReload(tabId, currentUrl);
      }
    })
  );
};

const resetAllRulesAndReload = (tabId?: number, currentUrl?: string) => {
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: allRuleIds(),
      addRules: buildRules(blockedSites),
    },
    withLastErrorLog("updateDynamicRules(reset all)", () => {
      // Optional: log the current dynamic rules for debugging.
      chrome.declarativeNetRequest.getDynamicRules((rules) => {
        console.log("Dynamic rules after reset:", rules.map((r) => r.id));
      });

      if (!tabId || !currentUrl) return;

      const isExtensionUrl =
        currentUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`);

      // Force a top-level navigation so DNR re-evaluates and blocks.
      if (isExtensionUrl) {
        chrome.tabs.reload(tabId);
      } else {
        chrome.tabs.update(tabId, { url: currentUrl });
      }
    })
  );
};

// ---------- Peek with ChatGPT integration ----------

type PeekInjectionStatus = "sent" | "filled" | "clipboard" | "error" | "unknown";

type PeekWithChatGPTMessage = {
  type: "peek-with-chatgpt";
  site?: string | null;
  originalUrl?: string | null;
};

const parseSiteFromSender = (sender?: any): string | null => {
  if (!sender?.url) return null;
  try {
    const u = new URL(sender.url);
    return u.searchParams.get("site");
  } catch (err) {
    console.warn("Failed to parse sender site", err);
    return null;
  }
};

const sanitizeSite = (value?: string | null): string | null => {
  if (!value) return null;
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const stripTags = (value: string): string =>
  value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

type SnapshotItem = { title: string; url?: string };

const uniq = <T, K extends string | number>(arr: T[], by: (item: T) => K): T[] => {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of arr) {
    const key = by(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const absolutize = (href: string, base: string): string => {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
};

const NAV_WORDS = new Set([
  "home",
  "sections",
  "top stories",
  "newsletters",
  "podcasts",
  "live",
  "opinion",
  "subscribe",
  "sign in",
  "account",
  "help",
  "about",
  "menu",
  "search",
  "latest",
  "trending",
  "more",
  "privacy",
  "terms",
  "contact",
]);

const extractFromJSONLD = (html: string, baseUrl: string): SnapshotItem[] => {
  const results: SnapshotItem[] = [];
  const rx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    const candidates: any[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        candidates.push(...parsed);
      } else {
        candidates.push(parsed);
      }
    } catch {
      continue;
    }

    const pushArticle = (node: any) => {
      if (!node) return;
      const headline = node?.headline || node?.name || node?.title;
      const url = node?.url || node?.mainEntityOfPage?.["@id"] || node?.mainEntityOfPage;
      if (headline && typeof headline === "string") {
        results.push({
          title: headline.trim(),
          url: url ? absolutize(url, baseUrl) : undefined,
        });
      }
    };

    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      const type = Array.isArray(node["@type"]) ? node["@type"][0] : node["@type"];

      if (type === "ItemList" && Array.isArray(node.itemListElement)) {
        for (const element of node.itemListElement) {
          const item = element?.item || element;
          if (item) pushArticle(item);
        }
      } else if (
        type === "NewsArticle" ||
        type === "Article" ||
        type === "CreativeWork"
      ) {
        pushArticle(node);
      } else if (node["@graph"]) {
        for (const graphNode of node["@graph"]) {
          walk(graphNode);
        }
      }
    };

    for (const candidate of candidates) {
      walk(candidate);
    }
  }

  return uniq(results, (item) => `${item.title}|${item.url || ""}`).slice(0, 12);
};

const discoverFeeds = (html: string, baseUrl: string): string[] => {
  const feeds: string[] = [];
  const rx = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html))) {
    const tag = match[0];
    const type = (tag.match(/type=["']([^"']+)["']/i)?.[1] || "").toLowerCase();
    if (!/rss|atom|rdf\+xml|application\/xml/.test(type)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) feeds.push(absolutize(href, baseUrl));
  }

  return uniq(feeds, (feed) => feed);
};

const parseRSSItems = (xml: string): SnapshotItem[] => {
  const items: SnapshotItem[] = [];

  const itemRx = /<item>[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRx.exec(xml))) {
    const block = match[0];
    const title =
      (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || "").trim();
    const link =
      (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ||
        block.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*\/?/i)?.[1] ||
        "").trim();
    if (title && !NAV_WORDS.has(title.toLowerCase())) {
      items.push({ title: stripTags(title), url: link || undefined });
    }
  }

  if (items.length === 0) {
    const entryRx = /<entry>[\s\S]*?<\/entry>/gi;
    while ((match = entryRx.exec(xml))) {
      const block = match[0];
      const title =
        (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || "").trim();
      const link = (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "").trim();
      if (title && !NAV_WORDS.has(title.toLowerCase())) {
        items.push({ title: stripTags(title), url: link || undefined });
      }
    }
  }

  return uniq(items, (item) => `${item.title}|${item.url || ""}`).slice(0, 12);
};

const discoverAmp = (html: string, baseUrl: string): string[] => {
  const candidates: string[] = [];

  const link = html.match(/<link[^>]+rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (link) {
    candidates.push(absolutize(link, baseUrl));
  }

  try {
    const parsed = new URL(baseUrl);
    const ampCandidates = [
      baseUrl.includes("?") ? `${baseUrl}&amp=1` : `${baseUrl}?amp=1`,
      baseUrl.includes("?")
        ? `${baseUrl}&outputType=amp`
        : `${baseUrl}?outputType=amp`,
      `${parsed.origin}${parsed.pathname.replace(/\/?$/, "/amp")}${parsed.search || ""}`,
    ];
    candidates.push(...ampCandidates);
  } catch {
    // ignore URL parsing issues
  }

  return uniq(candidates, (candidate) => candidate);
};

const extractAnchorsFromMain = (html: string): SnapshotItem[] => {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const chunk = mainMatch ? mainMatch[1] : html;

  const items: SnapshotItem[] = [];
  const anchorRx = /<a\s+[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRx.exec(chunk))) {
    const raw = stripTags(match[1]).replace(/\s+/g, " ").trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (NAV_WORDS.has(lower)) continue;
    if (raw.length < 25 || raw.length > 160) continue;
    items.push({ title: raw });
  }

  return uniq(items, (item) => item.title.toLowerCase()).slice(0, 12);
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    redirect: "follow",
    credentials: "omit",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    referrerPolicy: "no-referrer",
  });
  return response.text();
};

const fetchSnapshot = async (url: string): Promise<string> => {
  const baseUrl = url;
  let html = "";

  try {
    html = await fetchText(url);
  } catch (error) {
    console.warn("Failed to fetch HTML for snapshot", error);
  }

  let items: SnapshotItem[] = [];

  if (html) {
    items = extractFromJSONLD(html, baseUrl);
  }

  if (items.length < 3 && html) {
    const feeds = discoverFeeds(html, baseUrl);
    if (feeds.length) {
      try {
        const xml = await fetchText(feeds[0]);
        const rssItems = parseRSSItems(xml);
        if (rssItems.length) {
          items = rssItems;
        }
      } catch (error) {
        console.warn("Failed to fetch RSS feed for snapshot", error);
      }
    }
  }

  if (items.length < 3 && html) {
    const ampCandidates = discoverAmp(html, baseUrl);
    for (const ampUrl of ampCandidates) {
      try {
        const ampHtml = await fetchText(ampUrl);
        const ampItems = extractFromJSONLD(ampHtml, ampUrl);
        items = ampItems.length >= 3 ? ampItems : extractAnchorsFromMain(ampHtml);
        if (items.length) {
          break;
        }
      } catch (error) {
        console.warn("Failed to fetch AMP page for snapshot", error);
      }
    }
  }

  if (items.length < 3 && html) {
    items = extractAnchorsFromMain(html);
  }

  if (items.length === 0) {
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
    const metaDesc =
      (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "").trim();
    const parts: string[] = [];
    if (title) parts.push(`Title: ${title}`);
    if (metaDesc) parts.push(`Description: ${metaDesc}`);
    return parts.join("\n");
  }

  const bullets = items
    .map((item) => {
      const text = item.title.replace(/\s+/g, " ").trim();
      const targetUrl = item.url ? ` (${item.url})` : "";
      return `- ${text}${targetUrl}`;
    })
    .slice(0, 10)
    .join("\n");

  return `Top items:\n${bullets}`;
};

const buildPromptForPeek = ({
  url,
  snapshot = "",
}: {
  url: string;
  snapshot?: string;
}): string => {
  const lines = [
    "You're my quick-answer assistant.",
    "Task: Summarize the key information for this page in 5–7 bullets, then list 3 suggested next actions.",
    `URL: ${url}`,
    "Use the snapshot below if helpful. Do not ask me to paste content unless the snapshot is insufficient.",
    "If nothing sounds urgent, remind me to return to my priority work.",
  ];

  if (snapshot) {
    lines.push(`\n--- SNAPSHOT START ---\n${snapshot.slice(0, 2000)}\n--- SNAPSHOT END ---`);
  }

  return lines.join("\n");
};

const injectPromptIntoChatGPT = async (
  tabId: number,
  prompt: string,
  options: { autoSend?: boolean } = {}
): Promise<PeekInjectionStatus> => {
  const { autoSend = true } = options;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: async (text: string, autoSendFlag: boolean) => {
        const sleep = (ms: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, ms));

        const selectors = [
          "#prompt-textarea",
          '.ProseMirror[contenteditable="true"]',
          '[data-testid="prompt-textarea"]',
          "form textarea",
          "textarea",
          '[contenteditable="true"][role="textbox"]',
        ];

        const findInput = () => {
          for (const selector of selectors) {
            const el = document.querySelector(selector) as any;
            if (el) return el;
          }
          return null;
        };

        const setInputValue = (el: any, value: string) => {
          if (!el) return false;

          const isContentEditable =
            typeof el.getAttribute === "function" &&
            el.getAttribute("contenteditable") === "true";

          const ownerDoc = el.ownerDocument || document;
          const view = ownerDoc.defaultView || window;

          const createEvent = (EventCtor: any, type: string, init?: any) => {
            const fallbackCtor = view.Event || window.Event;
            try {
              return new EventCtor(type, init);
            } catch {
              return new fallbackCtor(type, init);
            }
          };

          const dispatchInputEvents = () => {
            const InputEventCtor = view.InputEvent || window.InputEvent || Event;
            const EventCtor = view.Event || window.Event;

            try {
              const ClipboardEventCtor =
                (view as any).ClipboardEvent ||
                (window as any).ClipboardEvent ||
                Event;
              const DataTransferCtor =
                (view as any).DataTransfer ||
                (window as any).DataTransfer;
              if (ClipboardEventCtor && DataTransferCtor) {
                const dataTransfer = new (DataTransferCtor as any)();
                if (typeof dataTransfer.setData === "function") {
                  dataTransfer.setData("text/plain", value);
                }
                const pasteEvt = createEvent(ClipboardEventCtor, "paste", {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: dataTransfer,
                });
                el.dispatchEvent(pasteEvt);
              }
            } catch (clipErr) {
              console.debug("Peek paste event fallback failed", clipErr);
            }

            const beforeEvt = createEvent(InputEventCtor, "beforeinput", {
              bubbles: true,
              cancelable: true,
              data: value,
              inputType: "insertFromPaste",
            });
            el.dispatchEvent(beforeEvt);

            const inputEvt = createEvent(InputEventCtor, "input", {
              bubbles: true,
              cancelable: true,
              data: value,
              inputType: "insertText",
            });
            el.dispatchEvent(inputEvt);

            const changeEvt = createEvent(EventCtor, "change", { bubbles: true });
            el.dispatchEvent(changeEvt);
          };

          if (isContentEditable) {
            const proseMirrorView =
              (el as any).pmView ||
              (el as any).editorView ||
              (el as any).__pmView;

            if (
              proseMirrorView &&
              typeof proseMirrorView.dispatch === "function" &&
              proseMirrorView.state?.tr
            ) {
              try {
                const { state } = proseMirrorView;
                const docSize = state.doc?.content?.size ?? state.doc?.nodeSize ?? 0;
                const transaction = state.tr.insertText(value, 0, docSize);
                proseMirrorView.dispatch(transaction);
                if (typeof proseMirrorView.focus === "function") {
                  proseMirrorView.focus();
                } else if (typeof el.focus === "function") {
                  el.focus({ preventScroll: true });
                }
                dispatchInputEvents();
                return true;
              } catch (pmError) {
                console.warn("ProseMirror direct dispatch failed", pmError);
              }
            }

            if (typeof el.focus === "function") {
              try {
                el.focus({ preventScroll: true });
              } catch {
                el.focus();
              }
            }

            const selection = ownerDoc.getSelection?.();
            if (selection && ownerDoc.createRange) {
              const range = ownerDoc.createRange();
              range.selectNodeContents(el);
              selection.removeAllRanges();
              selection.addRange(range);
            }

            let inserted = false;
            const execCommand = ownerDoc.execCommand?.bind(ownerDoc);
            if (execCommand) {
              try {
                execCommand("insertText", false, value);
                inserted = true;
              } catch {
                inserted = false;
              }
            }

            if (!inserted) {
              while (el.firstChild) {
                el.removeChild(el.firstChild);
              }
              const paragraph = ownerDoc.createElement("p");
              const lines = String(value).split(/\r?\n/);
              if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
                paragraph.appendChild(ownerDoc.createElement("br"));
              } else {
                lines.forEach((line, idx) => {
                  if (idx > 0) {
                    paragraph.appendChild(ownerDoc.createElement("br"));
                  }
                  paragraph.appendChild(ownerDoc.createTextNode(line));
                });
              }
              paragraph.removeAttribute?.("data-placeholder");
              el.appendChild(paragraph);
            }

            dispatchInputEvents();
            return true;
          }

          if ("value" in el) {
            const prototypes: any[] = [];
            if (view.HTMLTextAreaElement?.prototype) {
              prototypes.push(view.HTMLTextAreaElement.prototype);
            }
            if (view.HTMLInputElement?.prototype) {
              prototypes.push(view.HTMLInputElement.prototype);
            }
            prototypes.push(Object.getPrototypeOf(el));

            let applied = false;
            for (const proto of prototypes) {
              if (!proto) continue;
              const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
              if (descriptor?.set) {
                descriptor.set.call(el, value);
                applied = true;
                break;
              }
            }

            if (!applied) {
              el.value = value;
            }

            dispatchInputEvents();
            return true;
          }

          return false;
        };

        const clickSend = async (inputEl: any) => {
          const button = document.querySelector(
            '[data-testid="send-button"], button[aria-label*="Send"], form button[type="submit"]'
          ) as any;
          if (!button) return false;

          const view = button.ownerDocument?.defaultView || window;
          const KeyboardEventCtor =
            view.KeyboardEvent || window.KeyboardEvent || Event;

          const attemptClick = () => {
            if (button.disabled) {
              return false;
            }
            button.click();
            return true;
          };

          if (attemptClick()) return true;

          // As a fallback, synthesize an Enter keypress to trigger send.
          const enterEvent = new KeyboardEventCtor("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true,
          });
          button.dispatchEvent(enterEvent);

          await sleep(50);

          if (!attemptClick() && inputEl) {
            const inputView = inputEl.ownerDocument?.defaultView || window;
            const InputKeyboardCtor =
              inputView.KeyboardEvent || window.KeyboardEvent || Event;
            const inputEnter = new InputKeyboardCtor("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true,
            });
            inputEl.dispatchEvent(inputEnter);
            await sleep(50);
          }

          return attemptClick();
        };

        for (let attempt = 0; attempt < 25; attempt++) {
          const input = findInput();
          if (input && setInputValue(input, text)) {
            if (typeof input.focus === "function") {
              input.focus();
            }
            if (autoSendFlag) {
              return (await clickSend(input)) ? "sent" : "filled";
            }
            return "filled";
          }
          await sleep(200);
        }

        try {
          await navigator.clipboard.writeText(text);
          return "clipboard";
        } catch (err) {
          console.warn("Peek prompt clipboard fallback failed", err);
          return "error";
        }
      },
      args: [prompt, autoSend],
    });

    const status = results?.[0]?.result;
    if (status === "sent" || status === "filled" || status === "clipboard" || status === "error") {
      return status;
    }
    return "unknown";
  } catch (error) {
    console.warn("injectPromptIntoChatGPT failed", error);
    return "error";
  }
};

const openChatGPTWithPrompt = async (prompt: string): Promise<PeekInjectionStatus> => {
  try {
    const tab = await chrome.tabs.create({ url: "https://chatgpt.com/" });
    if (typeof tab.id !== "number") {
      return "error";
    }

    const tabId = tab.id;
    return await new Promise<PeekInjectionStatus>((resolve) => {
      let finished = false;
      let safetyTimer: ReturnType<typeof setTimeout>;

      const finalize = (status: PeekInjectionStatus) => {
        if (finished) return;
        finished = true;
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.onRemoved.removeListener(handleRemoved);
        clearTimeout(safetyTimer);
        resolve(status);
      };

      const handleUpdated = async (
        updatedTabId: number,
        info: any
      ) => {
        if (finished) return;
        if (updatedTabId === tabId && info.status === "complete") {
          const status = await injectPromptIntoChatGPT(tabId, prompt, {
            autoSend: false,
          });
          finalize(status);
        }
      };

      const handleRemoved = (removedTabId: number) => {
        if (removedTabId === tabId) {
          finalize("error");
        }
      };

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);

      safetyTimer = setTimeout(async () => {
        if (finished) return;
        const status = await injectPromptIntoChatGPT(tabId, prompt, {
          autoSend: false,
        });
        finalize(status);
      }, 5000);
    });
  } catch (error) {
    console.warn("openChatGPTWithPrompt failed", error);
    return "error";
  }
};

const handlePeekWithChatGPTRequest = async (
  payload: PeekWithChatGPTMessage,
  sender?: any
) => {
  const siteFromPayload = sanitizeSite(payload.site);
  const siteFromSender = sanitizeSite(parseSiteFromSender(sender));
  const siteForStorage = siteFromPayload || siteFromSender;

  const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
  const originalUrl = ensureHttpUrl(payload.originalUrl);
  const trimmedOriginal = payload.originalUrl?.trim() || null;
  const tabNavigationUrl =
    tabId !== null ? await getTabNavigatedHttpUrl(tabId) : null;

  if (tabId !== null) {
    if (originalUrl) {
      lastNavigatedUrlByTab.set(tabId, originalUrl);
    } else if (tabNavigationUrl) {
      lastNavigatedUrlByTab.set(tabId, tabNavigationUrl);
    }
  }

  const ledgerUrl = tabId !== null ? lastNavigatedUrlByTab.get(tabId) ?? null : null;
  const fallbackSiteUrl = siteForStorage
    ? ensureHttpUrl(`https://${siteForStorage}`)
    : null;
  const targetUrl = originalUrl || ledgerUrl || tabNavigationUrl || fallbackSiteUrl;
  const snapshot = targetUrl ? await fetchSnapshot(targetUrl) : "";

  const storageUrl = targetUrl || fallbackSiteUrl || trimmedOriginal;

  const prompt = buildPromptForPeek({
    url:
      storageUrl ||
      (siteForStorage ? `https://${siteForStorage}` : "Unknown URL"),
    snapshot,
  });

  if (chrome.storage?.session?.set) {
    chrome.storage.session.set({
      lastPeekPrompt: prompt,
      lastPeekSite: siteForStorage,
      lastPeekUrl: storageUrl,
    });
  }

  const status = await openChatGPTWithPrompt(prompt);
  return { status, prompt };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "peek-with-chatgpt") {
    handlePeekWithChatGPTRequest(message as PeekWithChatGPTMessage, sender)
      .then((result) => {
        sendResponse({ status: result.status, prompt: result.prompt });
      })
      .catch((error) => {
        console.warn("peek-with-chatgpt request failed", error);
        sendResponse({ status: "error", error: error?.message ?? String(error) });
      });
    return true;
  }
  return undefined;
});

// ---------- Lifecycle & Menus ----------

chrome.runtime.onInstalled.addListener(() => {
  // Context menu: Temporarily allow current site.
  chrome.contextMenus.create({
    id: "temporarily-allow",
    title: "Temporarily allow this site",
    contexts: ["action"],
  });

  // Context menu: Re-block ALL sites now (new canonical action).
  chrome.contextMenus.create({
    id: "reblock-all-now",
    title: "Re-block ALL sites now",
    contexts: ["action"],
  });
});

// Restore rules when the timer fires.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("restore-")) {
    const id = parseInt(alarm.name.split("-")[1], 10);
    const site = blockedSites[id - 1];
    if (site) {
      const normalizedHost = normalizeHost(site);
      if (normalizedHost && grayscaleHosts.has(normalizedHost)) {
        grayscaleHosts.delete(normalizedHost);
        persistGrayscaleHosts();
        syncGrayscaleForHostTabs(normalizedHost);
      }
      chrome.declarativeNetRequest.updateDynamicRules(
        { addRules: [buildRule(site, id)] },
        withLastErrorLog("alarm addRules")
      );
    }
  }
});

// ---------- Menu Click Handling ----------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.url) return;

  const u = new URL(tab.url);

  // Temporarily allow flow (unchanged; still works off rid or hostname fallback).
  if (info.menuItemId === "temporarily-allow") {
    const rid = Number(u.searchParams.get("rid"));
    if (Number.isFinite(rid)) {
      temporarilyAllowById(rid);
    } else {
      temporarilyAllow(u.hostname);
    }
    return;
  }

  // Re-block ALL flows (new + legacy id mapped to same behavior).
  if (info.menuItemId === "reblock-all-now" || info.menuItemId === "reblock-now") {
    reblockAllNow(tab.id, tab.url);
    return;
  }
});
