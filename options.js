const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

const DEFAULT_REDIRECT_URL = "http://localhost:5173";
const DEFAULT_REDIRECT_BTN_TEXT = "Go to Career Tracker";
const DEFAULT_GRAYSCALE_ON_TEMP_ALLOW = true;

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('sites');
  const saveBtn = document.getElementById('save');
  const minutesInput = document.getElementById('temp-allow-minutes');
  const redirectInput = document.getElementById('redirect-url');
  const btnTextInput = document.getElementById('redirect-btn-text');
  const grayscaleCheckbox = document.getElementById('grayscale-temp-allow');
  if (!(grayscaleCheckbox instanceof HTMLInputElement)) {
    return;
  }

  chrome.storage.sync.get(
    {
      blockedSites: DEFAULT_BLOCKED_SITES,
      tempAllowMinutes: 30,
      redirectUrl: DEFAULT_REDIRECT_URL,
      redirectBtnText: DEFAULT_REDIRECT_BTN_TEXT,
      grayscaleOnTemporaryAllow: DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
    },
    (data) => {
      textarea.value = data.blockedSites.join('\n');
      minutesInput.value = String(data.tempAllowMinutes);
      redirectInput.value = data.redirectUrl;
      btnTextInput.value = data.redirectBtnText;
      grayscaleCheckbox.checked = Boolean(data.grayscaleOnTemporaryAllow);
    }
  );

  saveBtn.addEventListener('click', () => {
    const sites = textarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const minutes = parseInt(minutesInput.value, 10) || 30;
    const redirectUrl = redirectInput.value.trim();
    const redirectBtnText = btnTextInput.value.trim() || DEFAULT_REDIRECT_BTN_TEXT;
    const grayscaleOnTemporaryAllow = Boolean(grayscaleCheckbox.checked);
    chrome.storage.sync.set({
      blockedSites: sites,
      tempAllowMinutes: minutes,
      redirectUrl,
      redirectBtnText,
      grayscaleOnTemporaryAllow,
    });
  });
});
