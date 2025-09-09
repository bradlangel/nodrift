const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('sites');
  const saveBtn = document.getElementById('save');

  chrome.storage.sync.get({ blockedSites: DEFAULT_BLOCKED_SITES }, (data) => {
    textarea.value = data.blockedSites.join('\n');
  });

  saveBtn.addEventListener('click', () => {
    const sites = textarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    chrome.storage.sync.set({ blockedSites: sites });
  });
});
