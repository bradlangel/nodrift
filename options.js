const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

const DEFAULT_REDIRECT_URL = "http://localhost:5173";

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('sites');
  const saveBtn = document.getElementById('save');
  const minutesInput = document.getElementById('temp-allow-minutes');
  const redirectInput = document.getElementById('redirect-url');

  chrome.storage.sync.get(
    {
      blockedSites: DEFAULT_BLOCKED_SITES,
      tempAllowMinutes: 30,
      redirectUrl: DEFAULT_REDIRECT_URL,
    },
    (data) => {
      textarea.value = data.blockedSites.join('\n');
      minutesInput.value = String(data.tempAllowMinutes);
      redirectInput.value = data.redirectUrl;
    }
  );

  saveBtn.addEventListener('click', () => {
    const sites = textarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const minutes = parseInt(minutesInput.value, 10) || 30;
    const redirectUrl = redirectInput.value.trim();
    chrome.storage.sync.set({
      blockedSites: sites,
      tempAllowMinutes: minutes,
      redirectUrl,
    });
  });
});
