// @ts-nocheck
import {
  DEFAULT_BLOCK_PAGE_ALTERNATIVES,
  DEFAULT_TEMP_ALLOW_MINUTES,
} from "./defaults.js";
import { isExtensionPageUrl } from "./browser-compat.js";

type BlockPageAction = {
  id: string;
  type: string;
  buttonId: string;
  label: string;
  pendingLabel?: string;
  scope?: string;
  messageType?: string;
  disabledReason?: string;
  reviewerLabel?: string | null;
  formTitle?: string;
  formPlaceholder?: string;
  formInitialValue?: string;
  submitLabel?: string;
  waitingLabel?: string;
};

type BlockPageActionsResponse = {
  ok?: boolean;
  primaryActions?: BlockPageAction[];
  secondaryActions?: BlockPageAction[];
  alternativeItems?: string[];
  accessGateActions?: BlockPageAction[];
};

type StatsDecision = {
  timestamp: number;
  action: string;
  minutes?: number;
  site?: string;
};

type LocalStats = {
  blockedAttemptsToday?: number;
  temporaryAllowsToday?: number;
  temporaryAllowUsedSecondsToday?: number;
  recentDecisions?: StatsDecision[];
};

type AccessReviewProgressStage =
  | "preparing"
  | "analyzing"
  | "reviewing"
  | "finalizing"
  | "complete";

type AccessReviewProgressMessage = {
  type?: string;
  stage?: AccessReviewProgressStage;
};

// Show where we came from (optional)
const params = new URLSearchParams(location.search);
const site = params.get("site");
const rawRuleId = Number(params.get("rid"));
const ruleId = Number.isInteger(rawRuleId) && rawRuleId > 0 ? rawRuleId : null;
if (site) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `🚫 ${site} is blocked!`;
}

const DEFAULT_TEMPORARY_ALLOW_BTN_TEXT = "Temporarily Allow";
const DEFAULT_PEEK_CHATGPT_BTN_TEXT = "Peek with ChatGPT";
const DEFAULT_TEMPORARY_ALLOW_PENDING_LABEL = "Temporarily allowing...";
const DEFAULT_REQUEST_ACCESS_BTN_TEXT = "Request access";
const DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT = "Request access";
const DEFAULT_REQUEST_ACCESS_TITLE = "Request access";
const DEFAULT_REQUEST_ACCESS_PLACEHOLDER =
  "Describe why you need access to this site and for how long.";
const LLM_REVIEW_WAITING_TEXT =
  "Reviewing locally. On-device AI responses can take a little while.";
const ACCESS_REVIEW_PROGRESS_PORT = "access-review-progress";
const ACCESS_REVIEW_PROGRESS_MESSAGES: Record<AccessReviewProgressStage, string> = {
  preparing: "Preparing request...",
  analyzing: "Checking request and local usage stats...",
  reviewing: "Reviewing access decision...",
  finalizing: "Applying decision...",
  complete: "Opening site...",
};
const DEFAULT_REQUEST_ACCESS_MESSAGE_TYPE = "request-if-then-intention-access";
const REQUEST_LLM_REVIEWED_MESSAGE_TYPE = "request-llm-reviewed-access";
const REQUEST_AI_STUDY_QUIZ_MESSAGE_TYPE = "request-ai-study-quiz-access";

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
  alternativeItems: DEFAULT_BLOCK_PAGE_ALTERNATIVES,
};

const ensureHttpUrl = (raw: unknown): string | null => {
  if (!raw) return null;
  try {
    const parsed = new URL(String(raw));
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
  chrome.tabs.getCurrent((tab: chrome.tabs.Tab) => {
    if (chrome.runtime.lastError) return;
    currentTabId = typeof tab?.id === "number" ? tab.id : null;
  });
}

const navigateToDestination = (destination: unknown): boolean => {
  const target = ensureHttpUrl(destination);
  if (!target) return false;

  const navigateInWindow = () => {
    window.location.assign(target);
  };

  if (chrome.tabs?.getCurrent && chrome.tabs?.update) {
    chrome.tabs.getCurrent((tab: chrome.tabs.Tab) => {
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

const formatDecisionLabel = (decision: StatsDecision): string => {
  if (decision.action === "temporary-allow") {
    const mins = Number.isFinite(decision.minutes) ? Math.max(decision.minutes, 0) : 0;
    return mins > 0 ? `Temporarily allowed (${mins}m)` : "Temporarily allowed";
  }
  return "Blocked";
};

const formatUsedTime = (seconds: unknown): string => {
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

const renderStats = (stats: LocalStats): void => {
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

const refreshStats = (): void => {
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
  statsLink.href = chrome.runtime.getURL("pages/stats.html");
};

const configureOptionsLink = () => {
  const optionsLink = document.getElementById("options-link");
  if (!(optionsLink instanceof HTMLAnchorElement)) return;
  optionsLink.href = chrome.runtime.getURL("pages/options.html");
};

const normalizeAlternativeItems = (items: unknown): string[] =>
  Array.isArray(items)
    ? items.map((item) => normalizeAlternativeLine(String(item).trim())).filter(Boolean)
    : DEFAULT_BLOCK_PAGE_ALTERNATIVES;

const normalizeAlternativeLabel = (label: string): string =>
  label.trim();

const stripDecorativeEmoji = (label: string): string =>
  label
    .replace(
      /^[\u{1f000}-\u{1faff}\u{2600}-\u{27bf}]\ufe0f?\s+/u,
      ""
    )
    .trim();

const normalizeAlternativeLine = (line: string): string => {
  const markdownLink = line.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) {
    return `[${normalizeAlternativeLabel(markdownLink[1])}](${markdownLink[2].trim()})`;
  }

  const pipeLink = line.match(/^(.+?)\s+\|\s+(https?:\/\/.+)$/i);
  if (pipeLink) {
    return `${normalizeAlternativeLabel(pipeLink[1])} | ${pipeLink[2].trim()}`;
  }

  return normalizeAlternativeLabel(line);
};

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
  if (action.formTitle) button.dataset.formTitle = action.formTitle;
  if (action.formPlaceholder) button.dataset.formPlaceholder = action.formPlaceholder;
  if (action.formInitialValue) button.dataset.formInitialValue = action.formInitialValue;
  if (action.submitLabel) button.dataset.submitLabel = action.submitLabel;
  if (action.waitingLabel) button.dataset.waitingLabel = action.waitingLabel;
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
  const displayLabel = stripDecorativeEmoji(parsedItem.label);
  if (parsedItem.url) {
    const link = document.createElement("a");
    link.href = parsedItem.url;
    link.textContent = displayLabel;
    item.appendChild(link);
  } else {
    item.textContent = displayLabel;
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

refreshStats();
maybeRecordBlockedAttempt();
configureStatsLink();
configureOptionsLink();

const wirePeekChatGptButton = () => {
  const peekBtn = document.getElementById("peek-chatgpt-btn");
  if (!peekBtn) return;

  const originalLabel = peekBtn.textContent || DEFAULT_PEEK_CHATGPT_BTN_TEXT;
  let attemptedUrl = document.referrer || "";
  if (isExtensionPageUrl(attemptedUrl)) {
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
  let countdownTimer = null;

  const stopCountdown = () => {
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  const startCountdown = (response) => {
    stopCountdown();
    const allowCountToday = Math.max(
      Math.floor(Number(response.allowCountToday) || 0),
      0
    );
    const readyAt =
      Number.isFinite(Number(response.readyAt)) && Number(response.readyAt) > 0
        ? Number(response.readyAt)
        : Date.now() + Math.max(Number(response.remainingSeconds) || 0, 0) * 1000;
    const countLabel = `${allowCountToday} ${
      allowCountToday === 1 ? "allow" : "allows"
    } today`;

    const render = () => {
      const remainingSeconds = Math.max(
        Math.ceil((readyAt - Date.now()) / 1000),
        0
      );
      if (remainingSeconds > 0) {
        button.disabled = true;
        button.textContent = `Available in ${remainingSeconds}s · ${countLabel}`;
        button.title = `The increasing delay uses all successful temporary allows today.`;
        return;
      }
      stopCountdown();
      button.disabled = false;
      button.textContent = "Allow now";
      button.title = `Delay complete after ${countLabel}.`;
    };

    render();
    if (button.disabled) {
      countdownTimer = window.setInterval(render, 250);
    }
  };

  button.addEventListener("click", () => {
    stopCountdown();
    button.disabled = true;
    button.textContent = pendingLabel;
    button.title = "";

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

        if (!chrome.runtime.lastError && response?.waiting) {
          startCountdown(response);
          return;
        }

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

  let activeRequestMessageType = DEFAULT_REQUEST_ACCESS_MESSAGE_TYPE;
  let activeSubmitLabel = DEFAULT_REQUEST_ACCESS_BTN_TEXT;
  let activeWaitingLabel = "Reviewing...";
  let activeFormPlaceholder = DEFAULT_REQUEST_ACCESS_PLACEHOLDER;
  let defaultAccessMinutes = null;
  let pendingFollowUp = null;

  const setResult = (message, tone = "") => {
    if (!resultEl) return;
    resultEl.textContent = message || "";
    resultEl.className = `request-access-result${tone ? ` ${tone}` : ""}`;
  };

  const resetSubmitButton = () => {
    submitBtn.disabled = false;
    purposeEl.disabled = false;
    submitBtn.textContent = pendingFollowUp?.submitLabel || activeSubmitLabel;
  };

  const getActiveWaitingLabel = () =>
    pendingFollowUp?.waitingLabel || activeWaitingLabel;

  const buildRequestPayload = (purpose) => ({
    type: activeRequestMessageType,
    url: window.location.href,
    tabId: currentTabId,
    currentUrl: document.referrer || null,
    currentSite: site,
    purpose: pendingFollowUp?.purpose || purpose,
    requestedMinutes: defaultAccessMinutes || DEFAULT_TEMP_ALLOW_MINUTES,
    followUpAnswer: pendingFollowUp ? purpose : null,
    followUpCount: pendingFollowUp ? 1 : 0,
    challengeId: pendingFollowUp?.challengeId || null,
  });

  const handleRequestAccessResponse = (response) => {
    resetSubmitButton();

    if (!response) {
      setResult("Could not process this request right now.", "fail");
      return;
    }

    const decision = response.decision;
    if (decision?.decision === "ASK_FOLLOWUP") {
      const question = response.question || decision.message || "Add one more detail.";
      pendingFollowUp = {
        purpose: response.topic || purposeEl.value.trim(),
        challengeId: response.challengeId || null,
        submitLabel: response.challengeId ? "Submit answers" : "Send follow-up",
        waitingLabel: response.challengeId ? "Checking answers..." : activeWaitingLabel,
      };
      setResult(question, response.challengeId ? "" : "thinking");
      purposeEl.value = "";
      purposeEl.placeholder = response.challengeId
        ? "Answer each question on a new line, or type A B C"
        : "Answer the follow-up";
      resetSubmitButton();
      purposeEl.focus();
      return;
    }

    if (!response.ok) {
      const message = decision?.message || response.error || "No access was granted.";
      if (
        pendingFollowUp?.challengeId &&
        activeRequestMessageType === REQUEST_AI_STUDY_QUIZ_MESSAGE_TYPE
      ) {
        pendingFollowUp = null;
        purposeEl.value = response.topic || "";
        purposeEl.placeholder = activeFormPlaceholder;
        resetSubmitButton();
      }
      setResult(`Staying blocked. ${message}`, "fail");
      return;
    }

    setResult("Approved for a focused, time-boxed task. Opening site...", "pass");

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
    DEFAULT_REQUEST_ACCESS_MESSAGE_TYPE;

  const getDisabledReason = (requestAction) =>
    requestAction?.disabledReason || requestAction?.dataset?.disabledReason || "";

  const getReviewerLabel = (requestAction) =>
    requestAction?.reviewerLabel || requestAction?.dataset?.reviewerLabel || "";

  const getFormTitle = (requestAction) =>
    requestAction?.formTitle || requestAction?.dataset?.formTitle || "";

  const getFormPlaceholder = (requestAction) =>
    requestAction?.formPlaceholder || requestAction?.dataset?.formPlaceholder || "";

  const getFormInitialValue = (requestAction) =>
    requestAction?.formInitialValue || requestAction?.dataset?.formInitialValue || "";

  const getSubmitLabel = (requestAction) =>
    requestAction?.submitLabel || requestAction?.dataset?.submitLabel || "";

  const getWaitingLabel = (requestAction) =>
    requestAction?.waitingLabel || requestAction?.dataset?.waitingLabel || "";

  const setRequestMode = (requestAction) => {
    activeRequestMessageType = getRequestMessageType(requestAction);
    const isLlmMode = activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE;
    activeSubmitLabel =
      getSubmitLabel(requestAction) ||
      (isLlmMode ? DEFAULT_LLM_REQUEST_ACCESS_BTN_TEXT : DEFAULT_REQUEST_ACCESS_BTN_TEXT);
    activeWaitingLabel = getWaitingLabel(requestAction) || "Reviewing...";
    if (formTitle) {
      formTitle.textContent =
        getFormTitle(requestAction) ||
        (isLlmMode ? "AI-reviewed request" : DEFAULT_REQUEST_ACCESS_TITLE);
    }
    activeFormPlaceholder =
      getFormPlaceholder(requestAction) || DEFAULT_REQUEST_ACCESS_PLACEHOLDER;
    purposeEl.placeholder = activeFormPlaceholder;
    if (providerEl) {
      const reviewerLabel = isLlmMode ? getReviewerLabel(requestAction) : "";
      providerEl.textContent = reviewerLabel;
      providerEl.hidden = !reviewerLabel;
    }
    if (metaEl) {
      metaEl.textContent = "";
      metaEl.hidden = true;
    }
    submitBtn.textContent = activeSubmitLabel;
  };

  const openRequestAccess = (requestAction, options = {}) => {
    setRequestMode(requestAction);
    pendingFollowUp = null;
    purposeEl.value = getFormInitialValue(requestAction);
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

  chrome.storage.sync.get({ tempAllowMinutes: DEFAULT_TEMP_ALLOW_MINUTES }, (data) => {
    const minutes = Number(data.tempAllowMinutes);
    defaultAccessMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : DEFAULT_TEMP_ALLOW_MINUTES;
    if (configuredGateAction?.type === "request-access") {
      openRequestAccess(configuredGateAction);
      return;
    }
    setRequestMode(document.querySelector(`[data-message-type="${activeRequestMessageType}"]`));
  });

  submitBtn.addEventListener("click", () => {
    const purpose = purposeEl.value.trim();

    if (!purpose) {
      setResult("Add a short request first.", "fail");
      return;
    }

    submitBtn.disabled = true;
    purposeEl.disabled = true;
    submitBtn.textContent = getActiveWaitingLabel();
    const payload = buildRequestPayload(purpose);

    if (
      activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE &&
      chrome.runtime.connect
    ) {
      sendRequestAccessWithProgress(payload);
      return;
    }

    if (activeRequestMessageType === REQUEST_LLM_REVIEWED_MESSAGE_TYPE) {
      setResult(LLM_REVIEW_WAITING_TEXT, "thinking");
    } else if (!pendingFollowUp) {
      setResult("", "");
    }

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
