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
const ACCESS_GATE_ACTION_IDS = new Set([
  "temporary-allow-domain",
  LOCAL_INTENT_ACCESS_GATE_ACTION_ID,
  LLM_REVIEWED_ACCESS_GATE_ACTION_ID,
]);

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

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("sites");
  const saveBtn = document.getElementById("save");
  const minutesInput = document.getElementById("temp-allow-minutes");
  const redirectInput = document.getElementById("redirect-url");
  const btnTextInput = document.getElementById("redirect-btn-text");
  const grayscaleCheckbox = document.getElementById("grayscale-temp-allow");
  const accessGateSelect = document.getElementById("access-gate-action");
  const showRedirectCheckbox = document.getElementById("show-career-tracker-redirect");
  const showPeekCheckbox = document.getElementById("show-chatgpt-peek");
  const llmProviderSelect = document.getElementById("llm-provider");
  const llmReviewStrictnessSelect = document.getElementById("llm-review-strictness");
  const llmLeisureAllowanceInput = document.getElementById("llm-leisure-allowance");
  const llmReviewStrictnessLabel = document.getElementById("llm-review-strictness-label");
  const llmLeisureAllowanceLabel = document.getElementById("llm-leisure-allowance-label");
  const openAiModelInput = document.getElementById("openai-model");
  const openAiApiKeyInput = document.getElementById("openai-api-key");
  const openAiModelField = document.getElementById("openai-model-field");
  const openAiApiKeyField = document.getElementById("openai-api-key-field");
  const llmConfigStatus = document.getElementById("llm-config-status");
  const saveStatus = document.getElementById("save-status");
  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !(saveBtn instanceof HTMLButtonElement) ||
    !(minutesInput instanceof HTMLInputElement) ||
    !(redirectInput instanceof HTMLInputElement) ||
    !(btnTextInput instanceof HTMLInputElement) ||
    !(grayscaleCheckbox instanceof HTMLInputElement) ||
    !(accessGateSelect instanceof HTMLSelectElement) ||
    !(showRedirectCheckbox instanceof HTMLInputElement) ||
    !(showPeekCheckbox instanceof HTMLInputElement) ||
    !(llmProviderSelect instanceof HTMLSelectElement) ||
    !(llmReviewStrictnessSelect instanceof HTMLInputElement) ||
    !(llmLeisureAllowanceInput instanceof HTMLInputElement) ||
    !(openAiModelInput instanceof HTMLInputElement) ||
    !(openAiApiKeyInput instanceof HTMLInputElement)
  ) {
    return;
  }

  const setStatus = (message) => {
    if (!saveStatus) return;
    saveStatus.textContent = message;
  };

  const updateLlmConfigStatus = () => {
    if (!llmConfigStatus) return;
    const provider = normalizeLlmProvider(llmProviderSelect.value);
    const isChromeLocal = provider === "chrome-local";
    if (openAiModelField) openAiModelField.hidden = isChromeLocal;
    if (openAiApiKeyField) openAiApiKeyField.hidden = isChromeLocal;

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
        "LLM-reviewed request gate is ready to use as a primary action.";
      llmConfigStatus.className = "hint ok";
      return;
    }

    llmConfigStatus.textContent =
      "Add an API key and model before selecting LLM-reviewed request on the block page.";
    llmConfigStatus.className = "hint warning";
  };

  const updateReviewRangeLabels = () => {
    const strictness = normalizeLlmReviewStrictness(llmReviewStrictnessSelect.value);
    const leisure = normalizeLlmReviewStrictness(llmLeisureAllowanceInput.value);
    if (llmReviewStrictnessLabel) {
      llmReviewStrictnessLabel.textContent = formatRangeLabel(strictness, PURPOSE_SCRUTINY_LABELS);
    }
    if (llmLeisureAllowanceLabel) {
      llmLeisureAllowanceLabel.textContent = formatRangeLabel(leisure, LEISURE_ALLOWANCE_LABELS);
    }
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
      llmProvider: DEFAULT_LLM_PROVIDER,
      llmReviewStrictness: DEFAULT_LLM_REVIEW_STRICTNESS,
      llmLeisureAllowance: DEFAULT_LLM_LEISURE_ALLOWANCE,
      openAiModel: DEFAULT_OPENAI_MODEL,
    },
    (syncData) => {
      chrome.storage.local.get({ openAiApiKey: "" }, (localData) => {
        textarea.value = syncData.blockedSites.join("\n");
        minutesInput.value = String(syncData.tempAllowMinutes);
        const accessGateActionId = normalizeAccessGateActionId(syncData.accessGateActionId);
        accessGateSelect.value = ACCESS_GATE_ACTION_IDS.has(accessGateActionId)
          ? accessGateActionId
          : DEFAULT_ACCESS_GATE_ACTION_ID;
        showRedirectCheckbox.checked = syncData.showCareerTrackerRedirect !== false;
        showPeekCheckbox.checked = syncData.showChatGptPeek !== false;
        redirectInput.value = syncData.redirectUrl;
        btnTextInput.value = syncData.redirectBtnText;
        grayscaleCheckbox.checked = Boolean(syncData.grayscaleOnTemporaryAllow);

        llmProviderSelect.value = normalizeLlmProvider(syncData.llmProvider);
        llmReviewStrictnessSelect.value = normalizeLlmReviewStrictness(syncData.llmReviewStrictness);
        llmLeisureAllowanceInput.value = normalizeLlmReviewStrictness(syncData.llmLeisureAllowance);
        openAiModelInput.value = normalizeOpenAiModel(syncData.openAiModel);
        openAiApiKeyInput.value = typeof localData.openAiApiKey === "string" ? localData.openAiApiKey : "";
        updateReviewRangeLabels();
        updateLlmConfigStatus();
      });
    }
  );

  openAiApiKeyInput.addEventListener("input", updateLlmConfigStatus);
  openAiModelInput.addEventListener("input", updateLlmConfigStatus);
  llmProviderSelect.addEventListener("change", updateLlmConfigStatus);
  llmReviewStrictnessSelect.addEventListener("input", updateReviewRangeLabels);
  llmLeisureAllowanceInput.addEventListener("input", updateReviewRangeLabels);

  saveBtn.addEventListener("click", () => {
    const sites = textarea.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const minutes = parseInt(minutesInput.value, 10) || 30;
    const selectedAccessGateActionId = normalizeAccessGateActionId(accessGateSelect.value);
    const accessGateActionId = ACCESS_GATE_ACTION_IDS.has(selectedAccessGateActionId)
      ? selectedAccessGateActionId
      : DEFAULT_ACCESS_GATE_ACTION_ID;
    const redirectUrl = redirectInput.value.trim();
    const redirectBtnText = btnTextInput.value.trim() || DEFAULT_REDIRECT_BTN_TEXT;
    const grayscaleOnTemporaryAllow = Boolean(grayscaleCheckbox.checked);
    const showCareerTrackerRedirect = Boolean(showRedirectCheckbox.checked);
    const showChatGptPeek = Boolean(showPeekCheckbox.checked);
    const llmProvider = normalizeLlmProvider(llmProviderSelect.value);
    const llmReviewStrictness = normalizeLlmReviewStrictness(llmReviewStrictnessSelect.value);
    const llmLeisureAllowance = normalizeLlmReviewStrictness(llmLeisureAllowanceInput.value);
    const openAiModel = normalizeOpenAiModel(openAiModelInput.value);
    const openAiApiKey = openAiApiKeyInput.value.trim();

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
        llmProvider,
        llmReviewStrictness,
        llmLeisureAllowance,
        openAiModel,
      },
      () => {
        if (chrome.runtime.lastError) {
          setStatus("Could not save settings.");
          return;
        }

        chrome.storage.local.set({ openAiApiKey }, () => {
          if (chrome.runtime.lastError) {
            setStatus("Saved most settings, but API key save failed.");
            return;
          }

          setStatus("Saved.");
          window.setTimeout(() => setStatus(""), 2500);
          updateLlmConfigStatus();
        });
      }
    );
  });
});
