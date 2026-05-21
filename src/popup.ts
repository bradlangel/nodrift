type ActiveTab = {
  id?: number;
  url?: string | null;
};

type ActiveGrantDetails = {
  ok?: boolean;
  active?: boolean;
  scope?: string;
  model?: string;
  elapsedSeconds?: number;
  remainingSeconds?: number;
  reason?: string;
  purpose?: string;
};

let activeTab: ActiveTab | null = null;

const REQUIRED_HOST_ORIGINS = ["<all_urls>"];

const siteEl = document.getElementById("current-site") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const activeGrantEl = document.getElementById("active-grant");
const allowBtn = document.getElementById("temporarily-allow") as HTMLButtonElement;
const reblockBtn = document.getElementById("reblock-now") as HTMLButtonElement;
const hostPermissionEl = document.getElementById("host-permission");
const enableHostPermissionBtn = document.getElementById(
  "enable-host-permission"
) as HTMLButtonElement | null;

const setStatus = (message: string): void => {
  statusEl.textContent = message;
};

const setHostPermissionVisible = (visible: boolean): void => {
  if (!hostPermissionEl) return;
  hostPermissionEl.className = visible ? "permission visible" : "permission";
};

const getHostLabel = (url?: string | null): string => {
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

const formatDuration = (seconds?: number): string => {
  const totalSeconds =
    typeof seconds === "number" && Number.isFinite(seconds)
      ? Math.max(Math.floor(seconds), 0)
      : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

const renderActiveGrant = (details: ActiveGrantDetails): void => {
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

  const appendRow = (label: string, value?: string): void => {
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
  appendRow("Model", details.model);
  appendRow("Elapsed", formatDuration(details.elapsedSeconds));
  appendRow("Remaining", formatDuration(details.remainingSeconds));
  appendRow("Reason", details.reason);
  appendRow("Purpose", details.purpose);

  activeGrantEl.className = "grant visible";
};

const checkHostPermissions = (): void => {
  if (!chrome.permissions?.contains) {
    setHostPermissionVisible(false);
    return;
  }

  chrome.permissions.contains(
    { origins: REQUIRED_HOST_ORIGINS },
    (granted: boolean) => {
      if (chrome.runtime.lastError) {
        return;
      }
      setHostPermissionVisible(!granted);
    }
  );
};

const requestHostPermissions = (): void => {
  if (!chrome.permissions?.request || !enableHostPermissionBtn) {
    setStatus("Open Firefox add-on permissions and allow site access.");
    return;
  }

  enableHostPermissionBtn.disabled = true;
  setStatus("Requesting site access...");

  chrome.permissions.request(
    { origins: REQUIRED_HOST_ORIGINS },
    (granted: boolean) => {
      enableHostPermissionBtn.disabled = false;

      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "Permission request failed.");
        return;
      }

      if (!granted) {
        setStatus("Blocking remains disabled until site access is allowed.");
        return;
      }

      setHostPermissionVisible(false);
      setStatus("Blocking enabled. Reload any already-open blocked tab.");
      chrome.runtime.sendMessage({ type: "host-permissions-updated" });
    }
  );
};

const sendTabMessage = (type: string): void => {
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
    (response: { ok?: boolean; error?: string }) => {
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

chrome.tabs.query({ active: true, currentWindow: true }, (tabs: ActiveTab[]) => {
  activeTab = tabs?.[0] || null;
  siteEl.textContent = getHostLabel(activeTab?.url);
  chrome.runtime.sendMessage(
    {
      type: "get-active-temporary-allow",
      url: activeTab?.url || null,
    },
    (response: ActiveGrantDetails) => {
      if (chrome.runtime.lastError) return;
      renderActiveGrant(response);
    }
  );
});

checkHostPermissions();
enableHostPermissionBtn?.addEventListener("click", requestHostPermissions);
allowBtn.addEventListener("click", () => sendTabMessage("temporarily-allow-tab"));
reblockBtn.addEventListener("click", () => sendTabMessage("reblock-all-now"));
