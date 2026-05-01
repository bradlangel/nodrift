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
const LOCAL_INTENT_ACCESS_GATE_ACTION_ID = "local-intent-request-access";
const LLM_REVIEWED_ACCESS_GATE_ACTION_ID = "llm-reviewed-request-access";
const LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID = "agentic-request-access";
const DEFAULT_SHOW_CAREER_TRACKER_REDIRECT = true;
const DEFAULT_SHOW_CHATGPT_PEEK = true;
const DEFAULT_LLM_PROVIDER = "openai";
const DEFAULT_LLM_REVIEW_STRICTNESS = "3";
const DEFAULT_LLM_LEISURE_ALLOWANCE = "3";
const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
const LLM_REVIEW_STRICTNESS_VALUES = new Set(["1", "2", "3", "4", "5"]);
const PURPOSE_SCRUTINY_LABELS = {
  1: "Relaxed",
  2: "Easy",
  3: "Balanced",
  4: "Strict",
  5: "Focus lock",
};
const LEISURE_ALLOWANCE_LABELS = {
  1: "Rare",
  2: "Limited",
  3: "Planned",
  4: "Flexible",
  5: "Open",
};
const FALLBACK_ACCESS_GATE_ACTIONS = [
  {
    id: DEFAULT_ACCESS_GATE_ACTION_ID,
    label: "Temporarily Allow",
    settingsLabel: "One-click temporary allow",
  },
  {
    id: LOCAL_INTENT_ACCESS_GATE_ACTION_ID,
    label: "Check intent",
    settingsLabel: "Local intent check",
  },
  {
    id: LLM_REVIEWED_ACCESS_GATE_ACTION_ID,
    label: "LLM-reviewed request",
    settingsLabel: "LLM-reviewed request",
  },
];

const normalizeAccessGateActionId = (actionId) =>
  actionId === LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID
    ? LOCAL_INTENT_ACCESS_GATE_ACTION_ID
    : actionId;

const normalizeLlmProvider = (provider) =>
  provider === "openai" || provider === "chrome-local" ? provider : DEFAULT_LLM_PROVIDER;

const normalizeLlmReviewStrictness = (strictness) => {
  if (strictness === "lenient") return "2";
  if (strictness === "balanced") return "3";
  if (strictness === "strict") return "4";
  return LLM_REVIEW_STRICTNESS_VALUES.has(String(strictness))
    ? String(strictness)
    : DEFAULT_LLM_REVIEW_STRICTNESS;
};

const formatRangeLabel = (value, labels) => `${value} - ${labels[value] || labels[3]}`;

const normalizeOpenAiModel = (model) => {
  const trimmed = typeof model === "string" ? model.trim() : "";
  return trimmed || DEFAULT_OPENAI_MODEL;
};

const singularize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const normalizeBlockedSiteEntry = (entry) => {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  const withoutWildcard = trimmed.replace(/^\*\./, "");
  const candidate = withoutWildcard.includes("://")
    ? withoutWildcard
    : `https://${withoutWildcard}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.hostname) return parsed.hostname.toLowerCase();
  } catch {
    // Fall back to the trimmed value below.
  }

  return withoutWildcard.split(/[/?#]/)[0].toLowerCase();
};

const normalizeBlockedSites = (value) => {
  const seen = new Set();
  let duplicateCount = 0;
  const sites = [];

  String(value)
    .split("\n")
    .map(normalizeBlockedSiteEntry)
    .filter(Boolean)
    .forEach((site) => {
      if (seen.has(site)) {
        duplicateCount += 1;
        return;
      }
      seen.add(site);
      sites.push(site);
    });

  return { sites, duplicateCount };
};

const findOverlappingSites = (sites) => {
  const overlaps = [];
  sites.forEach((site) => {
    sites.forEach((candidateParent) => {
      if (site === candidateParent) return;
      if (site.endsWith(`.${candidateParent}`)) {
        overlaps.push(`${site} under ${candidateParent}`);
      }
    });
  });
  return overlaps;
};

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("sites");
  const sitesSummary = document.getElementById("sites-summary");
  const cleanSitesBtn = document.getElementById("clean-sites");
  const saveBtn = document.getElementById("save");
  const minutesInput = document.getElementById("temp-allow-minutes");
  const redirectInput = document.getElementById("redirect-url");
  const btnTextInput = document.getElementById("redirect-btn-text");
  const grayscaleCheckbox = document.getElementById("grayscale-temp-allow");
  const showRedirectCheckbox = document.getElementById("show-career-tracker-redirect");
  const showPeekCheckbox = document.getElementById("show-chatgpt-peek");
  const llmProviderInputs = Array.from(
    document.querySelectorAll('input[name="llm-provider"]')
  );
  const llmReviewStrictnessInput = document.getElementById("llm-review-strictness");
  const llmLeisureAllowanceInput = document.getElementById("llm-leisure-allowance");
  const llmReviewStrictnessLabel = document.getElementById("llm-review-strictness-label");
  const llmLeisureAllowanceLabel = document.getElementById("llm-leisure-allowance-label");
  const openAiModelInput = document.getElementById("openai-model");
  const openAiApiKeyInput = document.getElementById("openai-api-key");
  const llmConfigStatus = document.getElementById("llm-config-status");
  const saveStatus = document.getElementById("save-status");

  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !(cleanSitesBtn instanceof HTMLButtonElement) ||
    !(saveBtn instanceof HTMLButtonElement) ||
    !(minutesInput instanceof HTMLInputElement) ||
    !(redirectInput instanceof HTMLInputElement) ||
    !(btnTextInput instanceof HTMLInputElement) ||
    !(grayscaleCheckbox instanceof HTMLInputElement) ||
    !(showRedirectCheckbox instanceof HTMLInputElement) ||
    !(showPeekCheckbox instanceof HTMLInputElement) ||
    llmProviderInputs.length === 0 ||
    !llmProviderInputs.every((input) => input instanceof HTMLInputElement) ||
    !(llmReviewStrictnessInput instanceof HTMLInputElement) ||
    !(llmLeisureAllowanceInput instanceof HTMLInputElement) ||
    !(openAiModelInput instanceof HTMLInputElement) ||
    !(openAiApiKeyInput instanceof HTMLInputElement)
  ) {
    return;
  }

  const setStatus = (message, className = "") => {
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.className = className;
  };

  let accessGateActions = FALLBACK_ACCESS_GATE_ACTIONS;
  let defaultGateActionId = DEFAULT_ACCESS_GATE_ACTION_ID;

  const getAccessGateActionIds = () =>
    new Set(accessGateActions.map((action) => action.id));

  const normalizeDefaultGateActionId = (preferredActionId) => {
    const normalizedPreferred = normalizeAccessGateActionId(preferredActionId);
    const validActionIds = getAccessGateActionIds();
    return validActionIds.has(normalizedPreferred)
      ? normalizedPreferred
      : DEFAULT_ACCESS_GATE_ACTION_ID;
  };

  const setDefaultGateActionId = (preferredActionId, options = {}) => {
    defaultGateActionId = normalizeDefaultGateActionId(preferredActionId);
    if (options.openDetails) {
      document.querySelectorAll("[data-gate-details]").forEach((details) => {
        if (details instanceof HTMLDetailsElement) {
          details.open = details.getAttribute("data-gate-details") === defaultGateActionId;
        }
      });
    }
    updateGateLibraryState();
  };

  const initializeDefaultGateActionId = (preferredActionId) => {
    setDefaultGateActionId(preferredActionId, { openDetails: true });
  };

  const loadAccessGateActions = (next) => {
    chrome.runtime.sendMessage({ type: "get-access-gate-actions" }, (response) => {
      if (!chrome.runtime.lastError && response?.ok && Array.isArray(response.actions)) {
        accessGateActions = response.actions;
      }
      next();
    });
  };

  const updateSitesSummary = () => {
    if (!sitesSummary) return;
    const { sites, duplicateCount } = normalizeBlockedSites(textarea.value);
    const overlaps = findOverlappingSites(sites);
    const parts = [singularize(sites.length, "domain")];

    if (duplicateCount > 0) {
      parts.push(`${singularize(duplicateCount, "duplicate")} will be removed`);
    }
    if (overlaps.length > 0) {
      parts.push(`${singularize(overlaps.length, "overlap")} found`);
    }

    sitesSummary.textContent = parts.join(". ");
    sitesSummary.className = duplicateCount > 0 || overlaps.length > 0 ? "hint warning" : "hint";
  };

  const cleanSitesInput = () => {
    const { sites, duplicateCount } = normalizeBlockedSites(textarea.value);
    textarea.value = sites.join("\n");
    updateSitesSummary();
    setStatus(duplicateCount > 0 ? "List cleaned." : "List normalized.");
  };

  const getSelectedLlmProvider = () => {
    const selected = llmProviderInputs.find((input) => input.checked);
    return normalizeLlmProvider(selected?.value);
  };

  const setSelectedLlmProvider = (provider) => {
    const normalizedProvider = normalizeLlmProvider(provider);
    llmProviderInputs.forEach((input) => {
      input.checked = input.value === normalizedProvider;
    });
  };

  const updateProviderCards = () => {
    const provider = getSelectedLlmProvider();
    document.querySelectorAll("[data-provider-card]").forEach((card) => {
      card.classList.toggle(
        "is-selected",
        card.getAttribute("data-provider-card") === provider
      );
    });
  };

  const hasReadyLlmProviderConfig = () => {
    const provider = getSelectedLlmProvider();
    if (provider === "chrome-local") return true;
    return (
      openAiApiKeyInput.value.trim().length > 0 &&
      openAiModelInput.value.trim().length > 0
    );
  };

  const updateLlmConfigStatus = () => {
    if (!llmConfigStatus) return;
    const provider = getSelectedLlmProvider();
    const isChromeLocal = provider === "chrome-local";
    updateProviderCards();

    if (isChromeLocal) {
      llmConfigStatus.textContent =
        "Chrome local LLM uses Gemini Nano on this device when the Prompt API is available.";
      llmConfigStatus.className = "hint ok";
      return;
    }

    const hasApiKey = openAiApiKeyInput.value.trim().length > 0;
    const hasModel = openAiModelInput.value.trim().length > 0;
    if (hasApiKey && hasModel) {
      llmConfigStatus.textContent =
        "LLM-reviewed request gate is ready to use as the default gate.";
      llmConfigStatus.className = "hint ok";
      return;
    }

    llmConfigStatus.textContent = "Add an API key and model before using LLM-reviewed request.";
    llmConfigStatus.className = "hint warning";
  };

  const updateGateLibraryState = () => {
    const selectedActionId = defaultGateActionId;
    document.querySelectorAll("[data-gate-card]").forEach((card) => {
      card.classList.toggle(
        "is-default",
        card.getAttribute("data-gate-card") === selectedActionId
      );
    });

    document.querySelectorAll("[data-gate-status]").forEach((statusElement) => {
      const actionId = statusElement.getAttribute("data-gate-status");
      if (!actionId) return;

      let label = "Not default";
      let className = "badge";
      if (actionId === LLM_REVIEWED_ACCESS_GATE_ACTION_ID && !hasReadyLlmProviderConfig()) {
        label = "Needs setup";
        className = "badge warning";
      }
      if (actionId === selectedActionId) {
        const needsSetup =
          actionId === LLM_REVIEWED_ACCESS_GATE_ACTION_ID && !hasReadyLlmProviderConfig();
        label = needsSetup ? "Default - needs setup" : "Default";
        className = needsSetup ? "badge warning" : "badge default";
      }

      statusElement.textContent = label;
      statusElement.className = className;
      statusElement.hidden = false;
    });

    document.querySelectorAll("[data-set-default]").forEach((button) => {
      const actionId = button.getAttribute("data-set-default");
      const selected = actionId === selectedActionId;
      button.textContent = selected ? "Default" : "Set as default";
      button.disabled = selected;
    });

    updateLlmConfigStatus();
  };

  const updateReviewRangeLabels = () => {
    const strictness = normalizeLlmReviewStrictness(llmReviewStrictnessInput.value);
    const leisure = normalizeLlmReviewStrictness(llmLeisureAllowanceInput.value);
    if (llmReviewStrictnessLabel) {
      llmReviewStrictnessLabel.textContent = formatRangeLabel(strictness, PURPOSE_SCRUTINY_LABELS);
    }
    if (llmLeisureAllowanceLabel) {
      llmLeisureAllowanceLabel.textContent = formatRangeLabel(leisure, LEISURE_ALLOWANCE_LABELS);
    }
  };

  const loadSettings = () => {
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
        llmProvider: DEFAULT_LLM_PROVIDER,
        llmReviewStrictness: DEFAULT_LLM_REVIEW_STRICTNESS,
        llmLeisureAllowance: DEFAULT_LLM_LEISURE_ALLOWANCE,
        openAiModel: DEFAULT_OPENAI_MODEL,
      },
      (syncData) => {
        chrome.storage.local.get({ openAiApiKey: "" }, (localData) => {
          const storedBlockedSites = Array.isArray(syncData.blockedSites)
            ? syncData.blockedSites
            : DEFAULT_BLOCKED_SITES;

          textarea.value = storedBlockedSites.join("\n");
          minutesInput.value = String(syncData.tempAllowMinutes);
          initializeDefaultGateActionId(syncData.accessGateActionId);
          showRedirectCheckbox.checked = syncData.showCareerTrackerRedirect !== false;
          showPeekCheckbox.checked = syncData.showChatGptPeek !== false;
          redirectInput.value = syncData.redirectUrl;
          btnTextInput.value = syncData.redirectBtnText;
          grayscaleCheckbox.checked = Boolean(syncData.grayscaleOnTemporaryAllow);

          setSelectedLlmProvider(syncData.llmProvider);
          llmReviewStrictnessInput.value = normalizeLlmReviewStrictness(syncData.llmReviewStrictness);
          llmLeisureAllowanceInput.value = normalizeLlmReviewStrictness(syncData.llmLeisureAllowance);
          openAiModelInput.value = normalizeOpenAiModel(syncData.openAiModel);
          openAiApiKeyInput.value =
            typeof localData.openAiApiKey === "string" ? localData.openAiApiKey : "";
          updateSitesSummary();
          updateReviewRangeLabels();
          updateGateLibraryState();
        });
      }
    );
  };

  loadAccessGateActions(loadSettings);

  textarea.addEventListener("input", updateSitesSummary);
  cleanSitesBtn.addEventListener("click", cleanSitesInput);
  openAiApiKeyInput.addEventListener("input", updateGateLibraryState);
  openAiModelInput.addEventListener("input", updateGateLibraryState);
  llmProviderInputs.forEach((input) => {
    input.addEventListener("change", updateGateLibraryState);
  });
  llmReviewStrictnessInput.addEventListener("input", updateReviewRangeLabels);
  llmLeisureAllowanceInput.addEventListener("input", updateReviewRangeLabels);

  document.querySelectorAll("[data-set-default]").forEach((button) => {
    button.addEventListener("click", () => {
      const actionId = button.getAttribute("data-set-default");
      if (!actionId || !getAccessGateActionIds().has(actionId)) return;
      setDefaultGateActionId(actionId, { openDetails: true });
    });
  });

  saveBtn.addEventListener("click", () => {
    const normalizedSites = normalizeBlockedSites(textarea.value).sites;
    textarea.value = normalizedSites.join("\n");
    updateSitesSummary();

    const accessGateActionId = normalizeDefaultGateActionId(defaultGateActionId);
    const minutes = parseInt(minutesInput.value, 10) || 30;
    const redirectUrl = redirectInput.value.trim();
    const redirectBtnText = btnTextInput.value.trim() || DEFAULT_REDIRECT_BTN_TEXT;
    const grayscaleOnTemporaryAllow = Boolean(grayscaleCheckbox.checked);
    const showCareerTrackerRedirect = Boolean(showRedirectCheckbox.checked);
    const showChatGptPeek = Boolean(showPeekCheckbox.checked);
    const llmProvider = getSelectedLlmProvider();
    const llmReviewStrictness = normalizeLlmReviewStrictness(llmReviewStrictnessInput.value);
    const llmLeisureAllowance = normalizeLlmReviewStrictness(llmLeisureAllowanceInput.value);
    const openAiModel = normalizeOpenAiModel(openAiModelInput.value);
    const openAiApiKey = openAiApiKeyInput.value.trim();

    chrome.storage.sync.set(
      {
        blockedSites: normalizedSites,
        tempAllowMinutes: minutes,
        accessGateActionId,
        showCareerTrackerRedirect,
        showChatGptPeek,
        redirectUrl,
        redirectBtnText,
        grayscaleOnTemporaryAllow,
        llmProvider,
        llmReviewStrictness,
        llmLeisureAllowance,
        openAiModel,
      },
      () => {
        if (chrome.runtime.lastError) {
          setStatus("Could not save settings.", "hint danger");
          return;
        }

        chrome.storage.local.set({ openAiApiKey }, () => {
          if (chrome.runtime.lastError) {
            setStatus("Saved most settings, but API key save failed.", "hint warning");
            return;
          }

          setDefaultGateActionId(accessGateActionId);
          updateGateLibraryState();
          setStatus("Saved.", "hint ok");
          window.setTimeout(() => setStatus(""), 2500);
        });
      }
    );
  });
});
