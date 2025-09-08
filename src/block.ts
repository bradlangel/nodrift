const blockedSites = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

const TEMP_ALLOW_MINUTES = 30;

const buildRule = (site: string, id: number): chrome.declarativeNetRequest.Rule => ({
  id,
  priority: 1,
  action: {
    type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
    // Instead of extensionPath, use transform so we can attach query params.
    redirect: {
      transform: {
        scheme: "chrome-extension",
        host: chrome.runtime.id,
        path: "/block.html",
        queryTransform: {
          addOrReplaceParams: [
            { key: "rid",  value: String(id) },
            { key: "site", value: site },
          ],
        },
      },
    },
  },
  condition: {
    // Your "*://site/*" works, but this is tighter (matches domain boundary).
    urlFilter: `||${site}^`,
    resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
  },
});

const buildRules = (sites: string[]): chrome.declarativeNetRequest.Rule[] =>
  sites.map((site, idx) => buildRule(site, idx + 1));

console.log("Website blocker: Service Worker Loaded");

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: blockedSites.map((_, idx) => idx + 1),
      addRules: buildRules(blockedSites),
    },
    () => {
      chrome.declarativeNetRequest.getDynamicRules((rules) => {
        console.log("Dynamic rules have been updated:", rules);
      });
    }
  );

  chrome.contextMenus.create({
    id: "temporarily-allow",
    title: `Temporarily allow this site`,
    contexts: ["action"],
  });
});

// Helper: allow by rule id (no fragile hostname lookups)
const temporarilyAllowById = (id: number, minutes: number) => {
  chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [id] });
  chrome.alarms.create(`restore-${id}`, { delayInMinutes: minutes });
};

// (Optional) keep your old hostname-based helper as a fallback
const temporarilyAllow = (site: string, minutes: number) => {
  const idx = blockedSites.indexOf(site);
  if (idx === -1) return;
  temporarilyAllowById(idx + 1, minutes);
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("restore-")) {
    const id = parseInt(alarm.name.split("-")[1], 10);
    const site = blockedSites[id - 1];
    if (site) {
      chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [buildRule(site, id)],
      });
    }
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "temporarily-allow" || !tab?.url) return;

  // If we're on block.html, it will have ?rid=…&site=…
  const u = new URL(tab.url);
  const rid = Number(u.searchParams.get("rid"));

  if (Number.isFinite(rid)) {
    temporarilyAllowById(rid, TEMP_ALLOW_MINUTES);
  } else {
    // Fallback if user triggers the menu somewhere else
    temporarilyAllow(u.hostname, TEMP_ALLOW_MINUTES);
  }
});
