const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

let blockedSites = [...DEFAULT_BLOCKED_SITES];

const TEMP_ALLOW_MINUTES = 30;

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.blockedSites) {
    blockedSites = changes.blockedSites.newValue;
    refreshRules();
    chrome.storage.local.set({ cachedBlockedSites: blockedSites });
  }
});

// Temporarily allow by rule id (removes rule & sets timer to restore).
const temporarilyAllowById = (id: number, minutes: number) => {
  chrome.declarativeNetRequest.updateDynamicRules(
    { removeRuleIds: [id] },
    withLastErrorLog("removeRuleIds")
  );
  chrome.alarms.create(`restore-${id}`, { delayInMinutes: minutes });
};

// (Optional) hostname-based helper (uses most-specific match).
const temporarilyAllow = (host: string, minutes: number) => {
  const id = findRuleIdByHostname(host);
  if (id) temporarilyAllowById(id, minutes);
};

// Re-add a specific rule immediately and refresh the current tab so it takes effect.
const restoreNowById = (id: number, tabId?: number, currentUrl?: string) => {
  chrome.alarms.clear(`restore-${id}`);
  const site = blockedSites[id - 1];
  if (!site) return;

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
      temporarilyAllowById(rid, TEMP_ALLOW_MINUTES);
    } else {
      temporarilyAllow(u.hostname, TEMP_ALLOW_MINUTES);
    }
    return;
  }

  // Re-block ALL flows (new + legacy id mapped to same behavior).
  if (info.menuItemId === "reblock-all-now" || info.menuItemId === "reblock-now") {
    reblockAllNow(tab.id, tab.url);
    return;
  }
});
