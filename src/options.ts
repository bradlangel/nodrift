import type { GateModule } from "./core/access-contracts.js";
import type {
  GateOptionsProvider,
  GateOptionsRangeField,
  GateOptionsTextField,
} from "./core/options-contracts.js";
import { GATE_MODULES } from "./gates/registry.js";

const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "www.youtube.com",
  "news.ycombinator.com",
  "www.yahoo.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
];

const DEFAULT_BLOCK_PAGE_ALTERNATIVES = [
  "📖 Read a book",
  "🏃‍♀️ Go for a run",
  "✅ Complete a task",
  "📝 Improve a skill",
  "💼 Go to Career Tracker | http://localhost:5173",
];
const LEGACY_ALTERNATIVE_LABELS = new Map([
  ["Read a book", "📖 Read a book"],
  ["Go for a walk", "🏃‍♀️ Go for a run"],
  ["Go for a run", "🏃‍♀️ Go for a run"],
  ["Complete a task", "✅ Complete a task"],
  ["Practice a skill", "📝 Improve a skill"],
  ["Improve a skill", "📝 Improve a skill"],
  ["Go to Career Tracker", "💼 Go to Career Tracker"],
]);
const DEFAULT_GRAYSCALE_ON_TEMP_ALLOW = true;
const DEFAULT_TEMP_ALLOW_MINUTES = 10;
const DEFAULT_ACCESS_GATE_ACTION_ID = "temporary-allow-domain";
const LOCAL_INTENT_ACCESS_GATE_ACTION_ID = "local-intent-request-access";
const LLM_REVIEWED_ACCESS_GATE_ACTION_ID = "llm-reviewed-request-access";
const LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID = "agentic-request-access";
const DEFAULT_SHOW_CHATGPT_PEEK = true;
const DEFAULT_LLM_PROVIDER = "chrome-local";
const DEFAULT_LLM_REVIEW_STRICTNESS = "3";
const DEFAULT_LLM_LEISURE_ALLOWANCE = "3";
const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
const ACCESS_GATE_ACTIONS = GATE_MODULES.map((module) => module.action);
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

type RangeLabels = Record<string, string>;

type NormalizedBlockedSites = {
  sites: string[];
  duplicateCount: number;
};

const normalizeAccessGateActionId = (actionId: unknown): string =>
  actionId === LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID
    ? LOCAL_INTENT_ACCESS_GATE_ACTION_ID
    : String(actionId || "");

const normalizeLlmProvider = (provider: unknown): string =>
  provider === "openai" || provider === "chrome-local" ? provider : DEFAULT_LLM_PROVIDER;

const normalizeLlmReviewStrictness = (strictness: unknown): string => {
  if (strictness === "lenient") return "2";
  if (strictness === "balanced") return "3";
  if (strictness === "strict") return "4";
  return LLM_REVIEW_STRICTNESS_VALUES.has(String(strictness))
    ? String(strictness)
    : DEFAULT_LLM_REVIEW_STRICTNESS;
};

const formatRangeLabel = (value: string, labels: RangeLabels): string =>
  `${value} - ${labels[value] || labels[3]}`;

const normalizeOpenAiModel = (model: unknown): string => {
  const trimmed = typeof model === "string" ? model.trim() : "";
  return trimmed || DEFAULT_OPENAI_MODEL;
};

const singularize = (
  count: number,
  singular: string,
  plural = `${singular}s`
): string =>
  `${count} ${count === 1 ? singular : plural}`;

const normalizeBlockedSiteEntry = (entry: string): string | null => {
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

const normalizeBlockedSites = (value: unknown): NormalizedBlockedSites => {
  const seen = new Set();
  let duplicateCount = 0;
  const sites: string[] = [];

  String(value)
    .split("\n")
    .map(normalizeBlockedSiteEntry)
    .filter((site): site is string => Boolean(site))
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

const findOverlappingSites = (sites: string[]): string[] => {
  const overlaps: string[] = [];
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

const normalizeAlternativeLines = (value: unknown): string[] =>
  String(value)
    .split("\n")
    .map((line) => line.trim())
    .map(normalizeAlternativeLine)
    .filter(Boolean);

const normalizeAlternativeLabel = (label: string): string =>
  LEGACY_ALTERNATIVE_LABELS.get(label.trim()) || label.trim();

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

const normalizeStoredAlternatives = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((line) => normalizeAlternativeLine(String(line).trim())).filter(Boolean)
    : DEFAULT_BLOCK_PAGE_ALTERNATIVES;

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const renderTextField = (field: GateOptionsTextField) => `
  <div class="field" id="${escapeHtml(field.id)}-field">
    <label for="${escapeHtml(field.id)}">${escapeHtml(field.label)}</label>
    <input
      type="${escapeHtml(field.type)}"
      id="${escapeHtml(field.id)}"
      ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ""}
      ${field.autocomplete ? `autocomplete="${escapeHtml(field.autocomplete)}"` : ""}
    />
    ${field.hint ? `<p class="hint">${escapeHtml(field.hint)}</p>` : ""}
  </div>
`;

const renderProvider = (
  providerGroupName: string,
  provider: GateOptionsProvider
) => `
  <article class="provider-card" data-provider-card="${escapeHtml(provider.id)}">
    <label class="provider-choice" for="${escapeHtml(providerGroupName)}-${escapeHtml(provider.id)}">
      <input
        type="radio"
        id="${escapeHtml(providerGroupName)}-${escapeHtml(provider.id)}"
        name="${escapeHtml(providerGroupName)}"
        value="${escapeHtml(provider.id)}"
      />
      <span>
        <span class="provider-title">${escapeHtml(provider.label)}</span>
        <span class="hint">${escapeHtml(provider.description)}</span>
      </span>
    </label>
    ${
      provider.fields?.length || provider.hint
        ? `<div class="provider-config">
            ${provider.fields?.map(renderTextField).join("") ?? ""}
            ${provider.hint ? `<p class="hint">${escapeHtml(provider.hint)}</p>` : ""}
          </div>`
        : ""
    }
  </article>
`;

const renderRangeField = (field: GateOptionsRangeField) => `
  <div class="field">
    <label for="${escapeHtml(field.id)}">${escapeHtml(field.label)}</label>
    <div class="range-row">
      <input
        type="range"
        id="${escapeHtml(field.id)}"
        min="${field.min}"
        max="${field.max}"
        step="${field.step}"
        value="${escapeHtml(field.value)}"
      />
      <span id="${escapeHtml(field.labelId)}" class="range-value"></span>
    </div>
  </div>
`;

const renderGateOptions = (module: GateModule) => {
  const options = module.options;
  if (!options) return "";

  const providerMarkup = options.providerGroup
    ? `
      <fieldset>
        <legend class="label">${escapeHtml(options.providerGroup.legend)}</legend>
        <div class="provider-list">
          ${options.providerGroup.providers
            .map((provider) =>
              renderProvider(options.providerGroup!.inputName, provider)
            )
            .join("")}
        </div>
      </fieldset>
    `
    : "";

  const rangeMarkup = options.rangeFields?.length
    ? `<div class="field-row">${options.rangeFields.map(renderRangeField).join("")}</div>`
    : "";

  const statusMarkup = options.statusId
    ? `<p id="${escapeHtml(options.statusId)}" class="hint warning" aria-live="polite"></p>`
    : "";
  const panelMarkup =
    providerMarkup || rangeMarkup || statusMarkup
      ? `<div class="llm-panel">
          ${providerMarkup}
          ${rangeMarkup}
          ${statusMarkup}
        </div>`
      : "";

  return `
    ${options.notes?.map((note) => `<p class="hint">${escapeHtml(note)}</p>`).join("") ?? ""}
    ${panelMarkup}
  `;
};

const renderGateCard = (module: GateModule) => {
  const action = module.action;
  const options = module.options;
  const actionLabel = action.settingsLabel || action.label;
  const cardDescription = options?.cardDescription || action.description;
  const detailsSummary = options?.detailsSummary || "Details";

  return `
    <article class="gate-card" data-gate-card="${escapeHtml(action.id)}">
      <div class="gate-card-header">
        <div>
          <h3>${escapeHtml(actionLabel)}</h3>
          <p class="hint">${escapeHtml(cardDescription)}</p>
        </div>
        <div class="gate-meta">
          <span class="badge" data-gate-status="${escapeHtml(action.id)}"></span>
          <button type="button" class="secondary-button" data-set-default="${escapeHtml(action.id)}">Set as default</button>
        </div>
      </div>
      <details class="gate-details" data-gate-details="${escapeHtml(action.id)}">
        <summary>${escapeHtml(detailsSummary)}</summary>
        <div class="gate-details-body">
          ${renderGateOptions(module)}
        </div>
      </details>
    </article>
  `;
};

const renderGateLibrary = (gateList: HTMLElement) => {
  gateList.innerHTML = GATE_MODULES.map(renderGateCard).join("");
};

document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("sites");
  const sitesSummary = document.getElementById("sites-summary");
  const cleanSitesBtn = document.getElementById("clean-sites");
  const saveBtn = document.getElementById("save");
  const minutesInput = document.getElementById("temp-allow-minutes");
  const alternativesInput = document.getElementById("block-page-alternatives");
  const grayscaleCheckbox = document.getElementById("grayscale-temp-allow");
  const showPeekCheckbox = document.getElementById("show-chatgpt-peek");
  const gateList = document.getElementById("gate-list");
  const saveStatus = document.getElementById("save-status");

  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !(cleanSitesBtn instanceof HTMLButtonElement) ||
    !(saveBtn instanceof HTMLButtonElement) ||
    !(minutesInput instanceof HTMLInputElement) ||
    !(alternativesInput instanceof HTMLTextAreaElement) ||
    !(grayscaleCheckbox instanceof HTMLInputElement) ||
    !(showPeekCheckbox instanceof HTMLInputElement) ||
    !(gateList instanceof HTMLElement)
  ) {
    return;
  }

  renderGateLibrary(gateList);

  const llmProviderInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="llm-provider"]')
  );
  const llmReviewStrictnessInput = document.getElementById("llm-review-strictness");
  const llmLeisureAllowanceInput = document.getElementById("llm-leisure-allowance");
  const llmReviewStrictnessLabel = document.getElementById("llm-review-strictness-label");
  const llmLeisureAllowanceLabel = document.getElementById("llm-leisure-allowance-label");
  const openAiModelInput = document.getElementById("openai-model");
  const openAiApiKeyInput = document.getElementById("openai-api-key");
  const llmConfigStatus = document.getElementById("llm-config-status");

  if (
    llmProviderInputs.length === 0 ||
    !llmProviderInputs.every((input) => input instanceof HTMLInputElement) ||
    !(llmReviewStrictnessInput instanceof HTMLInputElement) ||
    !(llmLeisureAllowanceInput instanceof HTMLInputElement) ||
    !(openAiModelInput instanceof HTMLInputElement) ||
    !(openAiApiKeyInput instanceof HTMLInputElement)
  ) {
    return;
  }

  const setStatus = (message: string, className = ""): void => {
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.className = className;
  };

  let accessGateActions = ACCESS_GATE_ACTIONS;
  let defaultGateActionId = DEFAULT_ACCESS_GATE_ACTION_ID;

  const getAccessGateActionIds = () =>
    new Set(accessGateActions.map((action) => action.id));

  const normalizeDefaultGateActionId = (preferredActionId: unknown): string => {
    const normalizedPreferred = normalizeAccessGateActionId(preferredActionId);
    const validActionIds = getAccessGateActionIds();
    return validActionIds.has(normalizedPreferred)
      ? normalizedPreferred
      : DEFAULT_ACCESS_GATE_ACTION_ID;
  };

  const setDefaultGateActionId = (
    preferredActionId: unknown,
    options: { openDetails?: boolean } = {}
  ) => {
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

  const initializeDefaultGateActionId = (preferredActionId: unknown): void => {
    setDefaultGateActionId(preferredActionId, { openDetails: true });
  };

  const updateSitesSummary = (): void => {
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

  const cleanSitesInput = (): void => {
    const { sites, duplicateCount } = normalizeBlockedSites(textarea.value);
    textarea.value = sites.join("\n");
    updateSitesSummary();
    setStatus(duplicateCount > 0 ? "List cleaned." : "List normalized.");
  };

  const getSelectedLlmProvider = (): string => {
    const selected = llmProviderInputs.find((input) => input.checked);
    return normalizeLlmProvider(selected?.value);
  };

  const setSelectedLlmProvider = (provider: unknown): void => {
    const normalizedProvider = normalizeLlmProvider(provider);
    llmProviderInputs.forEach((input) => {
      input.checked = input.value === normalizedProvider;
    });
  };

  const updateProviderCards = (): void => {
    const provider = getSelectedLlmProvider();
    document.querySelectorAll("[data-provider-card]").forEach((card) => {
      card.classList.toggle(
        "is-selected",
        card.getAttribute("data-provider-card") === provider
      );
    });
  };

  const hasReadyLlmProviderConfig = (): boolean => {
    const provider = getSelectedLlmProvider();
    if (provider === "chrome-local") return true;
    return (
      openAiApiKeyInput.value.trim().length > 0 &&
      openAiModelInput.value.trim().length > 0
    );
  };

  const updateLlmConfigStatus = (): void => {
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

  const updateGateLibraryState = (): void => {
    const selectedActionId = defaultGateActionId;
    document.querySelectorAll("[data-gate-card]").forEach((card) => {
      card.classList.toggle(
        "is-default",
        card.getAttribute("data-gate-card") === selectedActionId
      );
    });

    document.querySelectorAll<HTMLElement>("[data-gate-status]").forEach((statusElement) => {
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

    document.querySelectorAll<HTMLButtonElement>("[data-set-default]").forEach((button) => {
      const actionId = button.getAttribute("data-set-default");
      const selected = actionId === selectedActionId;
      button.textContent = selected ? "Default" : "Set as default";
      button.disabled = selected;
    });

    updateLlmConfigStatus();
  };

  const updateReviewRangeLabels = (): void => {
    const strictness = normalizeLlmReviewStrictness(llmReviewStrictnessInput.value);
    const leisure = normalizeLlmReviewStrictness(llmLeisureAllowanceInput.value);
    if (llmReviewStrictnessLabel) {
      llmReviewStrictnessLabel.textContent = formatRangeLabel(strictness, PURPOSE_SCRUTINY_LABELS);
    }
    if (llmLeisureAllowanceLabel) {
      llmLeisureAllowanceLabel.textContent = formatRangeLabel(leisure, LEISURE_ALLOWANCE_LABELS);
    }
  };

  const loadSettings = (): void => {
    chrome.storage.sync.get(
      {
        blockedSites: DEFAULT_BLOCKED_SITES,
        tempAllowMinutes: DEFAULT_TEMP_ALLOW_MINUTES,
        accessGateActionId: DEFAULT_ACCESS_GATE_ACTION_ID,
        showChatGptPeek: DEFAULT_SHOW_CHATGPT_PEEK,
        blockPageAlternatives: DEFAULT_BLOCK_PAGE_ALTERNATIVES,
        grayscaleOnTemporaryAllow: DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
        llmProvider: DEFAULT_LLM_PROVIDER,
        llmReviewStrictness: DEFAULT_LLM_REVIEW_STRICTNESS,
        llmLeisureAllowance: DEFAULT_LLM_LEISURE_ALLOWANCE,
        openAiModel: DEFAULT_OPENAI_MODEL,
      },
      (syncData: Record<string, any>) => {
        chrome.storage.local.get({ openAiApiKey: "" }, (localData: Record<string, any>) => {
          const storedBlockedSites = Array.isArray(syncData.blockedSites)
            ? syncData.blockedSites
            : DEFAULT_BLOCKED_SITES;

          textarea.value = storedBlockedSites.join("\n");
          minutesInput.value = String(syncData.tempAllowMinutes);
          initializeDefaultGateActionId(syncData.accessGateActionId);
          showPeekCheckbox.checked = syncData.showChatGptPeek !== false;
          alternativesInput.value = normalizeStoredAlternatives(
            syncData.blockPageAlternatives
          ).join("\n");
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

  loadSettings();

  textarea.addEventListener("input", updateSitesSummary);
  cleanSitesBtn.addEventListener("click", cleanSitesInput);
  openAiApiKeyInput.addEventListener("input", updateGateLibraryState);
  openAiModelInput.addEventListener("input", updateGateLibraryState);
  llmProviderInputs.forEach((input) => {
    input.addEventListener("change", updateGateLibraryState);
  });
  llmReviewStrictnessInput.addEventListener("input", updateReviewRangeLabels);
  llmLeisureAllowanceInput.addEventListener("input", updateReviewRangeLabels);

  document.querySelectorAll<HTMLButtonElement>("[data-set-default]").forEach((button) => {
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
    const minutes = parseInt(minutesInput.value, 10) || DEFAULT_TEMP_ALLOW_MINUTES;
    const blockPageAlternatives = normalizeAlternativeLines(alternativesInput.value);
    const grayscaleOnTemporaryAllow = Boolean(grayscaleCheckbox.checked);
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
        showChatGptPeek,
        blockPageAlternatives,
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
