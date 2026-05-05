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
const DEFAULT_REQUEST_ACCESS_BTN_TEXT = "Check intent";
const DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT = "Request LLM review";
const DEFAULT_ALTERNATIVE_ITEMS = [
  "📖 Read a book",
  "🏃‍♀️ Go for a run",
  "✅ Complete a task",
  "📝 Improve a skill",
];
const LLM_REVIEW_WAITING_TEXT =
  "Reviewing locally. Local LLM responses can take a little while.";
const ACCESS_REVIEW_PROGRESS_PORT = "access-review-progress";
const ACCESS_REVIEW_PROGRESS_MESSAGES = {
  preparing: "Preparing request...",
  analyzing: "Checking request and local usage stats...",
  reviewing: "Reviewing access decision...",
  finalizing: "Applying decision...",
  complete: "Opening site...",
};
const REQUEST_LOCAL_INTENT_MESSAGE_TYPE = "request-local-intent-access";
const REQUEST_LLM_REVIEWED_MESSAGE_TYPE = "request-llm-reviewed-access";

const FALLBACK_BLOCK_PAGE_ACTIONS = {
  primaryActions: [
    {
      id: "temporary-allow-domain",
      type: "temporary-allow",
      buttonId: "temporarily-allow-btn",
      label: DEFAULT_TEMPORARY_ALLOW_BTN_TEXT,
      pendingLabel: DEFAULT_TEMPORARY_ALLOW_PENDING_LABEL,
      scope: "domain",
      messageType: "temporarily-allow-tab",
    },
  ],
  secondaryActions: [],
  alternativeItems: DEFAULT_ALTERNATIVE_ITEMS,
};

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

let currentTabId = null;
if (chrome.tabs?.getCurrent) {
  chrome.tabs.getCurrent((tab) => {
    if (chrome.runtime.lastError) return;
    currentTabId = typeof tab?.id === "number" ? tab.id : null;
  });
}

const navigateToDestination = (destination) => {
  const target = ensureHttpUrl(destination);
  if (!target) return false;

  const navigateInWindow = () => {
    window.location.assign(target);
  };

  if (chrome.tabs?.getCurrent && chrome.tabs?.update) {
    chrome.tabs.getCurrent((tab) => {
      const tabId = typeof tab?.id === "number" ? tab.id : currentTabId;
      if (chrome.runtime.lastError || typeof tabId !== "number") {
        navigateInWindow();
        return;
      }

      chrome.tabs.update(tabId, { url: target }, () => {
        if (chrome.runtime.lastError) {
          navigateInWindow();
        }
      });
    });
    return true;
  }

  navigateInWindow();
  return true;
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

const configureOptionsLink = () => {
  const optionsLink = document.getElementById("options-link");
  if (!(optionsLink instanceof HTMLAnchorElement)) return;
  optionsLink.href = chrome.runtime.getURL("options.html");
};

const normalizeAlternativeItems = (items) =>
  Array.isArray(items)
    ? items.map((item) => String(item).trim()).filter(Boolean)
    : DEFAULT_ALTERNATIVE_ITEMS;

const parseAlternativeItem = (item) => {
  const markdownLink = item.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) {
    return {
      label: markdownLink[1].trim(),
      url: ensureHttpUrl(markdownLink[2]),
    };
  }

  const pipeLink = item.match(/^(.+?)\s+\|\s+(https?:\/\/.+)$/i);
  if (pipeLink) {
    return {
      label: pipeLink[1].trim(),
      url: ensureHttpUrl(pipeLink[2]),
    };
  }

  return { label: item, url: null };
};

const loadConfiguredActions = (callback) => {
  chrome.runtime.sendMessage({ type: "get-block-page-actions" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      console.warn(
        "Could not load block page actions",
        chrome.runtime.lastError?.message || response?.error || "Unknown error"
      );
      callback(FALLBACK_BLOCK_PAGE_ACTIONS);
      return;
    }

    callback({
      primaryActions: Array.isArray(response.primaryActions) ? response.primaryActions : [],
      secondaryActions: Array.isArray(response.secondaryActions) ? response.secondaryActions : [],
      alternativeItems: normalizeAlternativeItems(response.alternativeItems),
    });
  });
};

const renderActionButton = (action, groupClassName = "") => {
  const button = document.createElement("button");
  button.type = "button";
  button.id = action.buttonId;
  button.textContent = action.label;
  button.dataset.actionId = action.id;
  button.className = [action.className, groupClassName].filter(Boolean).join(" ");
  if (action.title) button.title = action.title;
  if (action.messageType) button.dataset.messageType = action.messageType;
  if (action.reviewerLabel) button.dataset.reviewerLabel = action.reviewerLabel;
  if (action.disabledReason) {
    button.disabled = true;
    button.dataset.disabledReason = action.disabledReason;
    button.classList.add("disabled");
  }
  return button;
};

const appendAlternativeTextItem = (root, configuredItem) => {
  const parsedItem = parseAlternativeItem(configuredItem);
  if (!parsedItem.label) return;

  const item = document.createElement("li");
  if (parsedItem.url) {
    const link = document.createElement("a");
    link.href = parsedItem.url;
    link.textContent = parsedItem.label;
    item.appendChild(link);
  } else {
    item.textContent = parsedItem.label;
  }
  root.appendChild(item);
};

const appendAlternativeActionItem = (root, action) => {
  const item = document.createElement("li");
  item.appendChild(renderActionButton(action, "alternative-action"));
  root.appendChild(item);
};

const renderAlternatives = (alternativeItems, secondaryActions) => {
  const root = document.getElementById("alternative-list");
  const title = document.getElementById("alternatives-title");
  if (!root) return;

  root.innerHTML = "";
  normalizeAlternativeItems(alternativeItems).forEach((item) => {
    appendAlternativeTextItem(root, item);
  });
  secondaryActions.forEach((action) => {
    appendAlternativeActionItem(root, action);
  });

  const hasAlternatives = root.children.length > 0;
  root.hidden = !hasAlternatives;
  if (title) title.hidden = !hasAlternatives;
};

const renderActions = ({ primaryActions, secondaryActions, alternativeItems }) => {
  const root = document.getElementById("actions");
  if (!root) return;

  root.innerHTML = "";
  renderAlternatives(alternativeItems, secondaryActions);

  const gateActions = primaryActions.filter((action) => action.type !== "request-access");
  if (gateActions.length > 0) {
    const primaryGroup = document.createElement("div");
    primaryGroup.className = "actions-primary";
    gateActions.forEach((action) => {
      primaryGroup.appendChild(renderActionButton(action));
    });
    root.appendChild(primaryGroup);
  }
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
        navigateToDestination(target);
      });
    }
  );
};

refreshStats();
maybeRecordBlockedAttempt();
configureStatsLink();
configureOptionsLink();

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
        tabId: currentTabId,
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
        if (navigateToDestination(destination)) {
          return;
        }

        reset("Temporarily allowed", 0);
        reset(originalLabel, 2500);
      }
    );
  });
};

const wireRequestAccessForm = (configuredGateAction = null) => {
  const requestSection = document.getElementById("request-access");
  const submitBtn = document.getElementById("request-access-btn");
  const formTitle = requestSection?.querySelector("h3");
  const providerEl = document.getElementById("request-access-provider");
  const metaEl = document.getElementById("request-access-meta");
  const purposeEl = document.getElementById("request-purpose");
  const resultEl = document.getElementById("request-access-result");
  if (
    !(submitBtn instanceof HTMLButtonElement) ||
    !(purposeEl instanceof HTMLTextAreaElement)
  ) {
    return;
  }

  let activeRequestMessageType = REQUEST_LOCAL_INTENT_MESSAGE_TYPE;
  let defaultAccessMinutes = null;

  const setResult = (message, tone = "") => {
    if (!resultEl) return;
    resultEl.textContent = message || "";
    resultEl.className = `request-access-result${tone ? ` ${tone}` : ""}`;
  };

  const resetSubmitButton = () => {
    submitBtn.disabled = false;
    purposeEl.disabled = false;
    submitBtn.textContent =
      activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE
        ? DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT
        : DEFAULT_REQUEST_ACCESS_BTN_TEXT;
  };

  const buildRequestPayload = (purpose) => ({
    type: activeRequestMessageType,
    url: window.location.href,
    tabId: currentTabId,
    currentUrl: document.referrer || null,
    currentSite: site,
    purpose,
    requestedMinutes: defaultAccessMinutes || 30,
    followUpAnswer: null,
    followUpCount: 1,
  });

  const handleRequestAccessResponse = (response) => {
    resetSubmitButton();

    if (!response) {
      setResult("Could not process this request right now.", "fail");
      return;
    }

    const decision = response.decision;
    if (!response.ok) {
      const message = decision?.message || response.error || "No access was granted.";
      setResult(`Staying blocked. ${message}`, "fail");
      return;
    }

    setResult("Approved. Opening site...", "pass");

    const responseDestination = ensureHttpUrl(response.destination);
    const siteUrl = site ? ensureHttpUrl(`https://${site}`) : null;
    const referrerUrl = ensureHttpUrl(document.referrer);
    const destination = responseDestination || siteUrl || referrerUrl;
    if (navigateToDestination(destination)) {
      return;
    }
    setResult("Approved, but I could not find a destination to open.", "fail");
  };

  const sendRequestAccessWithProgress = (payload) => {
    const port = chrome.runtime.connect({ name: ACCESS_REVIEW_PROGRESS_PORT });
    let settled = false;

    port.onMessage.addListener((message) => {
      if (message?.type === "progress") {
        setResult(
          ACCESS_REVIEW_PROGRESS_MESSAGES[message.stage] || LLM_REVIEW_WAITING_TEXT,
          "thinking"
        );
        return;
      }

      if (message?.type === "result") {
        settled = true;
        port.disconnect();
        handleRequestAccessResponse(message.response);
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      resetSubmitButton();
      setResult("The review connection closed before a decision came back.", "fail");
    });

    setResult(LLM_REVIEW_WAITING_TEXT, "thinking");
    port.postMessage(payload);
  };

  const getRequestMessageType = (requestAction) =>
    requestAction?.messageType ||
    requestAction?.dataset?.messageType ||
    REQUEST_LOCAL_INTENT_MESSAGE_TYPE;

  const getDisabledReason = (requestAction) =>
    requestAction?.disabledReason || requestAction?.dataset?.disabledReason || "";

  const getReviewerLabel = (requestAction) =>
    requestAction?.reviewerLabel || requestAction?.dataset?.reviewerLabel || "";

  const setRequestMode = (requestAction) => {
    activeRequestMessageType = getRequestMessageType(requestAction);
    const isLlmMode = activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE;
    if (formTitle) {
      formTitle.textContent = isLlmMode ? "Request reviewed access" : "Request focused access";
    }
    if (providerEl) {
      const reviewerLabel = isLlmMode ? getReviewerLabel(requestAction) : "";
      providerEl.textContent = reviewerLabel;
      providerEl.hidden = !reviewerLabel;
    }
    if (metaEl) {
      metaEl.textContent = "";
      metaEl.hidden = true;
    }
    submitBtn.textContent = isLlmMode
      ? DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT
      : DEFAULT_REQUEST_ACCESS_BTN_TEXT;
  };

  const openRequestAccess = (requestAction, options = {}) => {
    setRequestMode(requestAction);
    setResult("", "");

    if (requestSection) requestSection.hidden = false;
    if (options.scroll) {
      requestSection?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    const disabledReason = getDisabledReason(requestAction);
    if (disabledReason) {
      submitBtn.disabled = true;
      if (metaEl) {
        metaEl.textContent = disabledReason;
        metaEl.hidden = false;
      }
      setResult(disabledReason, "fail");
      return;
    }

    submitBtn.disabled = false;
    if (options.focus) purposeEl.focus();
  };

  const launchers = document.querySelectorAll('[data-action-id$="request-access"]');
  launchers.forEach((launcher) => {
    if (!(launcher instanceof HTMLButtonElement)) return;
    launcher.addEventListener("click", () => openRequestAccess(launcher, { scroll: true, focus: true }));
  });

  chrome.storage.sync.get({ tempAllowMinutes: 30 }, (data) => {
    const minutes = Number(data.tempAllowMinutes);
    defaultAccessMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 30;
    if (configuredGateAction?.type === "request-access") {
      openRequestAccess(configuredGateAction);
      return;
    }
    setRequestMode(document.querySelector(`[data-message-type="${activeRequestMessageType}"]`));
  });

  submitBtn.addEventListener("click", () => {
    const purpose = purposeEl.value.trim();

    if (!purpose) {
      setResult("Add a short purpose so we can route this request.", "fail");
      return;
    }

    submitBtn.disabled = true;
    purposeEl.disabled = true;
    submitBtn.textContent = "Reviewing...";
    const payload = buildRequestPayload(purpose);

    if (
      activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE &&
      chrome.runtime.connect
    ) {
      sendRequestAccessWithProgress(payload);
      return;
    }

    setResult(
      activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE
        ? LLM_REVIEW_WAITING_TEXT
        : "",
      activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE ? "thinking" : ""
    );

    chrome.runtime.sendMessage(
      payload,
      (response) => {
        if (chrome.runtime.lastError || !response) {
          console.warn(
            "Request access failed",
            chrome.runtime.lastError?.message || response?.error || "Unknown error"
          );
          resetSubmitButton();
          setResult("Could not process this request right now.", "fail");
          return;
        }

        handleRequestAccessResponse(response);
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
    if (action.type === "request-access") {
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

loadConfiguredActions((actions) => {
  renderActions(actions);
  wireActions([...actions.primaryActions, ...actions.secondaryActions]);
  wireRequestAccessForm(actions.primaryActions[0] || null);
});
