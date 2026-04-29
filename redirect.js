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
const DEFAULT_ACCESS_GATE_ACTION_ID = "temporary-allow-domain";
const LOCAL_INTENT_ACCESS_GATE_ACTION_ID = "local-intent-request-access";
const LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID = "agentic-request-access";
const DEFAULT_SHOW_CAREER_TRACKER_REDIRECT = true;
const DEFAULT_SHOW_CHATGPT_PEEK = true;
const LLM_REVIEWED_ACCESS_GATE_ACTION_ID = "llm-reviewed-request-access";
const REQUEST_LOCAL_INTENT_MESSAGE_TYPE = "request-local-intent-access";
const REQUEST_LLM_REVIEWED_MESSAGE_TYPE = "request-llm-reviewed-access";
const ACCESS_GATE_ACTION_IDS = new Set([
  "temporary-allow-domain",
  LOCAL_INTENT_ACCESS_GATE_ACTION_ID,
  LLM_REVIEWED_ACCESS_GATE_ACTION_ID,
]);

const BLOCK_PAGE_ACTIONS = [
  {
    id: "redirect",
    type: "redirect",
    buttonId: "redirect-btn",
    label: DEFAULT_REDIRECT_BTN_TEXT,
    visibleByDefault: false,
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
    id: "local-intent-request-access",
    type: "request-access",
    buttonId: "request-access-gate-btn",
    label: DEFAULT_REQUEST_ACCESS_BTN_TEXT,
    messageType: REQUEST_LOCAL_INTENT_MESSAGE_TYPE,
  },
  {
    id: "llm-reviewed-request-access",
    type: "request-access",
    buttonId: "llm-request-access-gate-btn",
    label: "LLM-reviewed request",
    messageType: REQUEST_LLM_REVIEWED_MESSAGE_TYPE,
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

const normalizeAccessGateActionId = (actionId) =>
  actionId === LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID
    ? LOCAL_INTENT_ACCESS_GATE_ACTION_ID
    : actionId;

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

const getAccessGateAction = (actionId) => {
  const normalizedActionId = normalizeAccessGateActionId(actionId);
  const configuredActionId = ACCESS_GATE_ACTION_IDS.has(normalizedActionId)
    ? normalizedActionId
    : DEFAULT_ACCESS_GATE_ACTION_ID;
  return (
    BLOCK_PAGE_ACTIONS.find((action) => action.id === configuredActionId) ||
    BLOCK_PAGE_ACTIONS.find((action) => action.id === DEFAULT_ACCESS_GATE_ACTION_ID)
  );
};

const loadConfiguredActions = (callback) => {
  chrome.storage.sync.get(
    {
      accessGateActionId: DEFAULT_ACCESS_GATE_ACTION_ID,
      showCareerTrackerRedirect: DEFAULT_SHOW_CAREER_TRACKER_REDIRECT,
      showChatGptPeek: DEFAULT_SHOW_CHATGPT_PEEK,
      llmProvider: "openai",
      openAiModel: "gpt-5-nano",
    },
    (data) => {
      chrome.storage.local.get({ openAiApiKey: "" }, (localData) => {
        const llmConfigured =
          data.llmProvider === "openai" &&
          typeof data.openAiModel === "string" &&
          data.openAiModel.trim().length > 0 &&
          typeof localData.openAiApiKey === "string" &&
          localData.openAiApiKey.trim().length > 0;

        const primaryAction = getAccessGateAction(data.accessGateActionId);
        const effectivePrimaryAction =
          primaryAction?.id === LLM_REVIEWED_ACCESS_GATE_ACTION_ID && !llmConfigured
            ? {
                ...primaryAction,
                label: "LLM-reviewed request (setup required)",
                disabledReason:
                  "LLM-reviewed request is selected, but OpenAI settings are incomplete. Add model and API key in Options.",
              }
            : primaryAction;

        const secondaryActionIds = [
          data.showCareerTrackerRedirect !== false ? "redirect" : null,
          data.showChatGptPeek !== false ? "peek-chatgpt" : null,
        ];
        const secondaryActions = secondaryActionIds
          .map((actionId) =>
            actionId ? BLOCK_PAGE_ACTIONS.find((action) => action.id === actionId) : null
          )
          .filter(Boolean);
        callback({
          primaryActions: effectivePrimaryAction ? [effectivePrimaryAction] : [],
          secondaryActions,
        });
      });
    }
  );
};

const renderActionButton = (action, groupClassName = "") => {
  const button = document.createElement("button");
  button.id = action.buttonId;
  button.textContent = action.label;
  button.dataset.actionId = action.id;
  button.className = [action.className, groupClassName].filter(Boolean).join(" ");
  if (action.title) button.title = action.title;
  if (action.messageType) button.dataset.messageType = action.messageType;
  if (action.disabledReason) {
    button.disabled = true;
    button.dataset.disabledReason = action.disabledReason;
    button.classList.add("disabled");
  }
  return button;
};

const renderActions = ({ primaryActions, secondaryActions }) => {
  const root = document.getElementById("actions");
  if (!root) return;

  root.innerHTML = "";

  const primaryGroup = document.createElement("div");
  primaryGroup.className = "actions-primary";
  primaryActions.forEach((action) => {
    primaryGroup.appendChild(renderActionButton(action));
  });
  root.appendChild(primaryGroup);

  if (secondaryActions.length === 0) return;

  const secondaryGroup = document.createElement("div");
  secondaryGroup.className = "actions-secondary";
  secondaryActions.forEach((action) => {
    secondaryGroup.appendChild(renderActionButton(action, "secondary-action"));
  });
  root.appendChild(secondaryGroup);
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

const wireRequestAccessForm = () => {
  const requestSection = document.getElementById("request-access");
  const submitBtn = document.getElementById("request-access-btn");
  const formTitle = requestSection?.querySelector("h3");
  const purposeEl = document.getElementById("request-purpose");
  const minutesEl = document.getElementById("request-minutes");
  const followUpRow = document.getElementById("follow-up-row");
  const followUpLabel = document.getElementById("follow-up-label");
  const followUpInput = document.getElementById("request-follow-up");
  const resultEl = document.getElementById("request-access-result");
  if (
    !(submitBtn instanceof HTMLButtonElement) ||
    !(purposeEl instanceof HTMLTextAreaElement) ||
    !(minutesEl instanceof HTMLInputElement) ||
    !(followUpInput instanceof HTMLInputElement)
  ) {
    return;
  }

  let activeRequestMessageType = REQUEST_LOCAL_INTENT_MESSAGE_TYPE;
  let followUpCount = 0;

  const setResult = (message, tone = "") => {
    if (!resultEl) return;
    resultEl.textContent = message || "";
    resultEl.className = `request-access-result${tone ? ` ${tone}` : ""}`;
  };

  const toggleFollowUp = (question) => {
    if (!followUpRow || !followUpLabel) return;
    if (question) {
      followUpRow.hidden = false;
      followUpLabel.textContent = question;
      return;
    }
    followUpRow.hidden = true;
    followUpLabel.textContent = "One quick follow-up";
    followUpInput.value = "";
  };

  const setRequestMode = (launcher) => {
    activeRequestMessageType = launcher?.dataset?.messageType || REQUEST_LOCAL_INTENT_MESSAGE_TYPE;
    const isLlmMode = activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE;
    if (formTitle) {
      formTitle.textContent = isLlmMode ? "LLM-reviewed request" : "Intent check";
    }
    submitBtn.textContent = isLlmMode
      ? DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT
      : DEFAULT_REQUEST_ACCESS_BTN_TEXT;
  };

  const openRequestAccess = (launcher) => {
    setRequestMode(launcher);
    followUpCount = 0;
    toggleFollowUp("");
    setResult("", "");

    if (requestSection) requestSection.hidden = false;
    requestSection?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const disabledReason = launcher?.dataset?.disabledReason;
    if (disabledReason) {
      submitBtn.disabled = true;
      setResult(disabledReason, "fail");
      return;
    }

    submitBtn.disabled = false;
    purposeEl.focus();
  };

  const launchers = document.querySelectorAll('[data-action-id$="request-access"]');
  launchers.forEach((launcher) => {
    if (!(launcher instanceof HTMLButtonElement)) return;
    launcher.addEventListener("click", () => openRequestAccess(launcher));
  });

  submitBtn.addEventListener("click", () => {
    const purpose = purposeEl.value.trim();
    const requestedMinutes = Number(minutesEl.value);
    const followUpAnswer = followUpInput.value.trim();

    if (!purpose) {
      setResult("Add a short purpose so we can route this request.", "fail");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Reviewing...";
    setResult("", "");

    chrome.runtime.sendMessage(
      {
        type: activeRequestMessageType,
        url: window.location.href,
        currentUrl: document.referrer || null,
        currentSite: site,
        purpose,
        requestedMinutes,
        followUpAnswer: followUpAnswer || null,
        followUpCount,
      },
      (response) => {
        submitBtn.disabled = false;
        submitBtn.textContent =
          activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE
            ? DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT
            : DEFAULT_REQUEST_ACCESS_BTN_TEXT;

        if (chrome.runtime.lastError || !response) {
          console.warn(
            "Request access failed",
            chrome.runtime.lastError?.message || response?.error || "Unknown error"
          );
          setResult("Could not process this request right now.", "fail");
          return;
        }

        const decision = response.decision;
        if (!response.ok) {
          if (decision?.decision === "ASK_FOLLOWUP") {
            followUpCount = 1;
            toggleFollowUp(decision.message || "One quick follow-up");
            setResult("Please add one more detail.", "");
            return;
          }
          followUpCount = 0;
          toggleFollowUp("");
          setResult(decision?.message || "Staying blocked for now.", "fail");
          return;
        }

        followUpCount = 0;
        toggleFollowUp("");
        setResult(decision?.message || "Approved. Opening now.", "pass");

        const responseDestination = ensureHttpUrl(response.destination);
        const siteUrl = site ? ensureHttpUrl(`https://${site}`) : null;
        const referrerUrl = ensureHttpUrl(document.referrer);
        const destination = responseDestination || siteUrl || referrerUrl;
        if (destination) {
          window.location.href = destination;
        }
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
  wireRequestAccessForm();
});
