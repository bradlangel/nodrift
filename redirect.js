// Show where we came from (optional)
const params = new URLSearchParams(location.search);
const site = params.get("site");
const rawRuleId = Number(params.get("rid"));
const ruleId = Number.isInteger(rawRuleId) && rawRuleId > 0 ? rawRuleId : null;
if (site) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `🚫 ${site} is blocked!`;
}

const DEFAULT_REDIRECT_URL = "http://localhost:5173";
const DEFAULT_REDIRECT_BTN_TEXT = "Go to Career Tracker";
const DEFAULT_TEMPORARY_ALLOW_BTN_TEXT = "Temporarily Allow";
const DEFAULT_PEEK_CHATGPT_BTN_TEXT = "Peek with ChatGPT";
const DEFAULT_TEMPORARY_ALLOW_PENDING_LABEL = "Temporarily allowing...";

const BLOCK_PAGE_ACTIONS = [
  {
    id: "redirect",
    type: "redirect",
    buttonId: "redirect-btn",
    label: DEFAULT_REDIRECT_BTN_TEXT,
  },
  {
    id: "temporary-allow-domain",
    type: "temporary-allow",
    buttonId: "temporarily-allow-btn",
    label: DEFAULT_TEMPORARY_ALLOW_BTN_TEXT,
    pendingLabel: DEFAULT_TEMPORARY_ALLOW_PENDING_LABEL,
    scope: "domain",
  },
  {
    id: "peek-chatgpt",
    type: "peek-chatgpt",
    buttonId: "peek-chatgpt-btn",
    label: DEFAULT_PEEK_CHATGPT_BTN_TEXT,
    className: "secondary",
    title:
      "Opens ChatGPT with your prompt and a quick page snapshot so you can review and send it yourself",
  },
  {
    id: "temporary-allow-url",
    type: "temporary-allow",
    buttonId: "temporarily-allow-url-btn",
    label: "Temporarily Allow This Page",
    pendingLabel: "Temporarily allowing this page...",
    scope: "url",
    visibleByDefault: false,
  },
];

const ensureHttpUrl = (raw) => {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null;
};

const formatDecisionLabel = (decision) => {
  if (decision.action === "temporary-allow") {
    const mins = Number.isFinite(decision.minutes) ? Math.max(decision.minutes, 0) : 0;
    return mins > 0 ? `Temporarily allowed (${mins}m)` : "Temporarily allowed";
  }
  return "Blocked";
};

const formatUsedTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
};

const renderStats = (stats) => {
  const statsRoot = document.getElementById("stats");
  if (!statsRoot || !stats) return;

  const blockedEl = document.getElementById("stats-blocked-attempts");
  const allowsEl = document.getElementById("stats-temp-allows");
  const usedMinutesEl = document.getElementById("stats-temp-allow-used-minutes");
  const recentEl = document.getElementById("stats-recent-decisions");

  if (blockedEl) blockedEl.textContent = String(stats.blockedAttemptsToday || 0);
  if (allowsEl) allowsEl.textContent = String(stats.temporaryAllowsToday || 0);
  if (usedMinutesEl) {
    usedMinutesEl.textContent = formatUsedTime(stats.temporaryAllowUsedSecondsToday || 0);
  }

  if (!recentEl) return;
  recentEl.innerHTML = "";
  const decisions = Array.isArray(stats.recentDecisions) ? stats.recentDecisions.slice(0, 5) : [];
  if (decisions.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No decisions yet today.";
    recentEl.appendChild(item);
    return;
  }

  decisions.forEach((decision) => {
    const item = document.createElement("li");
    const time = new Date(decision.timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const siteLabel = decision.site || "Unknown site";
    item.textContent = `${time} — ${formatDecisionLabel(decision)} • ${siteLabel}`;
    recentEl.appendChild(item);
  });
};

const refreshStats = () => {
  chrome.runtime.sendMessage({ type: "get-local-stats" }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Could not load local stats", chrome.runtime.lastError.message);
      return;
    }
    if (!response?.ok || !response.stats) return;
    renderStats(response.stats);
  });
};

const configureStatsLink = () => {
  const statsLink = document.getElementById("stats-more-link");
  if (!(statsLink instanceof HTMLAnchorElement)) return;
  statsLink.href = chrome.runtime.getURL("stats.html");
};

const getDefaultVisibleActions = () =>
  BLOCK_PAGE_ACTIONS.filter((action) => action.visibleByDefault !== false);

const renderActions = (actions) => {
  const root = document.getElementById("actions");
  if (!root) return;

  root.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.id = action.buttonId;
    button.textContent = action.label;
    if (action.className) button.className = action.className;
    if (action.title) button.title = action.title;
    root.appendChild(button);
  });
};

const maybeRecordBlockedAttempt = () => {
  if (!site || !ruleId) return;
  const navigationEntry = performance.getEntriesByType("navigation")?.[0];
  if (navigationEntry?.type === "reload") return;
  chrome.runtime.sendMessage(
    {
      type: "record-blocked-attempt",
      site,
      rid: ruleId,
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn("Could not record blocked attempt", chrome.runtime.lastError.message);
        return;
      }
      refreshStats();
    }
  );
};

const wireRedirectButton = () => {
  chrome.storage.sync.get(
    { redirectUrl: DEFAULT_REDIRECT_URL, redirectBtnText: DEFAULT_REDIRECT_BTN_TEXT },
    (data) => {
      const target = data.redirectUrl || DEFAULT_REDIRECT_URL;
      const btn = document.getElementById("redirect-btn");
      if (!btn) return;
      btn.textContent = data.redirectBtnText || DEFAULT_REDIRECT_BTN_TEXT;
      btn.addEventListener("click", () => {
        window.location = target;
      });
    }
  );
};

refreshStats();
maybeRecordBlockedAttempt();
configureStatsLink();

const wirePeekChatGptButton = () => {
  const peekBtn = document.getElementById("peek-chatgpt-btn");
  if (!peekBtn) return;

  const originalLabel = peekBtn.textContent || DEFAULT_PEEK_CHATGPT_BTN_TEXT;
  let attemptedUrl = document.referrer || "";
  if (attemptedUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    attemptedUrl = "";
  }
  peekBtn.addEventListener("click", () => {
    peekBtn.disabled = true;
    peekBtn.textContent = "Collecting page snapshot...";

    chrome.runtime.sendMessage(
      {
        type: "peek-with-chatgpt",
        site,
        originalUrl: attemptedUrl || null,
      },
      (response) => {
        const reset = (label = originalLabel, delay = 0) => {
          window.setTimeout(() => {
            peekBtn.disabled = false;
            peekBtn.textContent = label;
          }, delay);
        };

        if (chrome.runtime.lastError) {
          console.warn("Peek with ChatGPT failed", chrome.runtime.lastError.message);
          reset("Prompt copied — paste into ChatGPT", 0);
          reset(originalLabel, 3000);
          return;
        }

        const status = response?.status;
        if (status === "sent") {
          reset("Prompt + snapshot sent to ChatGPT", 800);
          reset(originalLabel, 2500);
          return;
        }
        if (status === "filled") {
          reset("Snapshot ready — review & send", 800);
          reset(originalLabel, 2500);
          return;
        }
        if (status === "clipboard") {
          reset("Prompt copied — paste into ChatGPT", 0);
          reset(originalLabel, 3000);
          return;
        }
        if (status === "error" || status === "unknown") {
          reset("Open ChatGPT manually", 0);
          reset(originalLabel, 3000);
          return;
        }

        reset(originalLabel, 400);
      }
    );
  });
};

const wireTemporaryAllowButton = (buttonId, scope, pendingLabel) => {
  const button = document.getElementById(buttonId);
  if (!button) return;
  const originalLabel = button.textContent || DEFAULT_TEMPORARY_ALLOW_BTN_TEXT;

  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = pendingLabel;

    chrome.runtime.sendMessage(
      {
        type: "temporarily-allow-tab",
        url: window.location.href,
        scope,
      },
      (response) => {
        const reset = (label = originalLabel, delay = 0) => {
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = label;
          }, delay);
        };

        if (chrome.runtime.lastError || !response?.ok) {
          console.warn(
            "Temporarily allow failed",
            chrome.runtime.lastError?.message || response?.error || "Unknown error"
          );
          reset("Could not temporarily allow", 0);
          reset(originalLabel, 2500);
          return;
        }

        button.textContent = "Allowed — opening site...";
        const responseDestination = ensureHttpUrl(response.destination);
        const siteUrl = site ? ensureHttpUrl(`https://${site}`) : null;
        const referrerUrl = ensureHttpUrl(document.referrer);
        const destination = responseDestination || siteUrl || referrerUrl;
        if (destination) {
          window.location.href = destination;
          return;
        }

        reset("Temporarily allowed", 0);
        reset(originalLabel, 2500);
      }
    );
  });
};

const wireActions = (actions) => {
  actions.forEach((action) => {
    if (action.type === "redirect") {
      wireRedirectButton();
      return;
    }
    if (action.type === "peek-chatgpt") {
      wirePeekChatGptButton();
      return;
    }
    if (action.type === "temporary-allow") {
      wireTemporaryAllowButton(
        action.buttonId,
        action.scope || "domain",
        action.pendingLabel || DEFAULT_TEMPORARY_ALLOW_PENDING_LABEL
      );
    }
  });
};

const defaultActions = getDefaultVisibleActions();
renderActions(defaultActions);
wireActions(defaultActions);
