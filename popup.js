let activeTab = null;

const siteEl = document.getElementById("current-site");
const statusEl = document.getElementById("status");
const allowBtn = document.getElementById("temporarily-allow");
const reblockBtn = document.getElementById("reblock-now");

const setStatus = (message) => {
  statusEl.textContent = message;
};

const getHostLabel = (url) => {
  if (!url) return "No active site";
  try {
    const parsed = new URL(url);
    const blockedSite = parsed.searchParams.get("site");
    if (blockedSite) return blockedSite;
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname;
    }
  } catch {
    // Fall through to the generic label.
  }
  return "No active site";
};

const sendTabMessage = (type) => {
  if (!activeTab?.url) {
    setStatus("No active site found.");
    return;
  }

  allowBtn.disabled = true;
  reblockBtn.disabled = true;
  setStatus("Working...");

  chrome.runtime.sendMessage(
    {
      type,
      tabId: activeTab.id,
      url: activeTab.url,
    },
    (response) => {
      allowBtn.disabled = false;
      reblockBtn.disabled = false;

      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Action failed.");
        return;
      }

      if (response?.ok) {
        setStatus(type === "temporarily-allow-tab" ? "Temporarily allowed." : "Re-blocked.");
        return;
      }

      setStatus(response?.error || "Action could not be applied.");
    }
  );
};

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  activeTab = tabs?.[0] || null;
  siteEl.textContent = getHostLabel(activeTab?.url);
});

allowBtn.addEventListener("click", () => sendTabMessage("temporarily-allow-tab"));
reblockBtn.addEventListener("click", () => sendTabMessage("reblock-all-now"));
