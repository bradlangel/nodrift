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
    redirect: {
      extensionPath: `/block.html`,
    },
  },
  condition: {
    urlFilter: `*://${site}/*`,
    resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
  },
});

const buildRules = (sites: string[]): chrome.declarativeNetRequest.Rule[] => {
  return sites.map((site, idx) => buildRule(site, idx + 1));
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
  chrome.alarms.create(`restore-${id}`, { delayInMinutes: minutes });
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('restore-')) {
    const id = parseInt(alarm.name.split('-')[1], 10);
    const site = blockedSites[id - 1];
    if (site) {
      chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [buildRule(site, id)],
      });
    }
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'temporarily-allow' && tab?.url) {
    const url = new URL(tab.url);
    temporarilyAllow(url.hostname, TEMP_ALLOW_MINUTES);
  }
});
