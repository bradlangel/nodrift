const blockedSites = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

const TEMP_ALLOW_MINUTES = 30;

const buildRules = (sites: string[]): chrome.declarativeNetRequest.Rule[] => {
  return sites.map((site, idx) => ({
    id: idx + 1,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: {
        extensionPath: `/block.html`
      },
    },
    condition: {
      urlFilter: `*://${site}/*`,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
    },
}));
};
console.log('Website blocker: Service Worker Loaded');

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: blockedSites.map((_, idx) => idx + 1),
    addRules: buildRules(blockedSites),
  }, () => {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      console.log('Dynamic rules have been updated:', rules);
    });
  });

  chrome.contextMenus.create({
    id: 'temporarily-allow',
    title: `Temporarily allow this site`,
    contexts: ['action'],
  });
});

const temporarilyAllow = (site: string, minutes: number) => {
  const idx = blockedSites.indexOf(site);
  if (idx === -1) return;
  const id = idx + 1;
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [id],
  });
  setTimeout(() => {
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: buildRules([site]),
    });
  }, minutes * 60 * 1000);
};

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'temporarily-allow' && tab?.url) {
    const url = new URL(tab.url);
    temporarilyAllow(url.hostname, TEMP_ALLOW_MINUTES);
  }
});
