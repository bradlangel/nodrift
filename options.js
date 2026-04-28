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
const DEFAULT_ACCESS_GATE_ACTION_ID = "temporary-allow-domain";
const DEFAULT_SHOW_CAREER_TRACKER_REDIRECT = true;
const DEFAULT_SHOW_CHATGPT_PEEK = true;
const ACCESS_GATE_ACTION_IDS = new Set([
  "temporary-allow-domain",
  "agentic-request-access",
]);

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('sites');
  const saveBtn = document.getElementById('save');
  const minutesInput = document.getElementById('temp-allow-minutes');
  const redirectInput = document.getElementById('redirect-url');
  const btnTextInput = document.getElementById('redirect-btn-text');
  const grayscaleCheckbox = document.getElementById('grayscale-temp-allow');
  const accessGateSelect = document.getElementById('access-gate-action');
  const showRedirectCheckbox = document.getElementById('show-career-tracker-redirect');
  const showPeekCheckbox = document.getElementById('show-chatgpt-peek');
  const saveStatus = document.getElementById('save-status');
  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !(saveBtn instanceof HTMLButtonElement) ||
    !(minutesInput instanceof HTMLInputElement) ||
    !(redirectInput instanceof HTMLInputElement) ||
    !(btnTextInput instanceof HTMLInputElement) ||
    !(grayscaleCheckbox instanceof HTMLInputElement) ||
    !(accessGateSelect instanceof HTMLSelectElement) ||
    !(showRedirectCheckbox instanceof HTMLInputElement) ||
    !(showPeekCheckbox instanceof HTMLInputElement)
  ) {
    return;
  }

  const setStatus = (message) => {
    if (!saveStatus) return;
    saveStatus.textContent = message;
  };

  chrome.storage.sync.get(
    {
      blockedSites: DEFAULT_BLOCKED_SITES,
      tempAllowMinutes: 30,
      accessGateActionId: DEFAULT_ACCESS_GATE_ACTION_ID,
      showCareerTrackerRedirect: DEFAULT_SHOW_CAREER_TRACKER_REDIRECT,
      showChatGptPeek: DEFAULT_SHOW_CHATGPT_PEEK,
      redirectUrl: DEFAULT_REDIRECT_URL,
      redirectBtnText: DEFAULT_REDIRECT_BTN_TEXT,
      grayscaleOnTemporaryAllow: DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
    },
    (data) => {
      textarea.value = data.blockedSites.join('\n');
      minutesInput.value = String(data.tempAllowMinutes);
      accessGateSelect.value = ACCESS_GATE_ACTION_IDS.has(data.accessGateActionId)
        ? data.accessGateActionId
        : DEFAULT_ACCESS_GATE_ACTION_ID;
      showRedirectCheckbox.checked = data.showCareerTrackerRedirect !== false;
      showPeekCheckbox.checked = data.showChatGptPeek !== false;
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
    const accessGateActionId = ACCESS_GATE_ACTION_IDS.has(accessGateSelect.value)
      ? accessGateSelect.value
      : DEFAULT_ACCESS_GATE_ACTION_ID;
    const redirectUrl = redirectInput.value.trim();
    const redirectBtnText = btnTextInput.value.trim() || DEFAULT_REDIRECT_BTN_TEXT;
    const grayscaleOnTemporaryAllow = Boolean(grayscaleCheckbox.checked);
    const showCareerTrackerRedirect = Boolean(showRedirectCheckbox.checked);
    const showChatGptPeek = Boolean(showPeekCheckbox.checked);
    chrome.storage.sync.set(
      {
        blockedSites: sites,
        tempAllowMinutes: minutes,
        accessGateActionId,
        showCareerTrackerRedirect,
        showChatGptPeek,
        redirectUrl,
        redirectBtnText,
        grayscaleOnTemporaryAllow,
      },
      () => {
        if (chrome.runtime.lastError) {
          setStatus('Could not save settings.');
          return;
        }
        setStatus('Saved.');
        window.setTimeout(() => setStatus(''), 2500);
      }
    );
  });
});
