const blockedSites = ["reddit.com", "old.reddit.com", "www.reddit.com"];

const buildRules = (sites: string[]): chrome.declarativeNetRequest.Rule[] => {
  return sites.map((site, idx) => ({
    id: idx + 1,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: {
        extensionPath: `/block.html?blockedUrl=${encodeURIComponent('{url}')}`
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
});
