let activeTab = null;

const siteEl = document.getElementById("current-site");
const statusEl = document.getElementById("status");
const activeGrantEl = document.getElementById("active-grant");
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

const formatDuration = (seconds) => {
  const totalSeconds = Number.isFinite(seconds) ? Math.max(Math.floor(seconds), 0) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

const renderActiveGrant = (details) => {
  if (!activeGrantEl) return;
  activeGrantEl.textContent = "";
  if (!details?.ok || !details.active) {
    activeGrantEl.className = "grant";
    return;
  }

  const scope = details.scope === "url" ? "URL" : "Domain";
  const title = document.createElement("strong");
  title.textContent = "Temporary access active";
  activeGrantEl.appendChild(title);

  const appendRow = (label, value) => {
    if (!value) return;
    const row = document.createElement("div");
    row.className = "grant-row";
    const labelEl = document.createElement("span");
    labelEl.className = "grant-label";
    labelEl.textContent = `${label}:`;
    row.appendChild(labelEl);
    row.append(` ${value}`);
    activeGrantEl.appendChild(row);
  };

  appendRow("Scope", scope);
  appendRow("Elapsed", formatDuration(details.elapsedSeconds));
  appendRow("Remaining", formatDuration(details.remainingSeconds));
  appendRow("Reason", details.reason);
  appendRow("Purpose", details.purpose);

  activeGrantEl.className = "grant visible";
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
  chrome.runtime.sendMessage(
    {
      type: "get-active-temporary-allow",
      url: activeTab?.url || null,
    },
    (response) => {
      if (chrome.runtime.lastError) return;
      renderActiveGrant(response);
    }
  );
});

allowBtn.addEventListener("click", () => sendTabMessage("temporarily-allow-tab"));
reblockBtn.addEventListener("click", () => sendTabMessage("reblock-all-now"));
