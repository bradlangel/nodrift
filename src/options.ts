import type { GateModule } from "./core/access-contracts.js";
import type {
  GateOptionsButton,
  GateOptionsProvider,
  GateOptionsRangeField,
  GateOptionsTextField,
} from "./core/options-contracts.js";
import {
  DEFAULT_ACCESS_EFFECT_IDS,
  DEFAULT_ACCESS_GATE_ACTION_ID,
  DEFAULT_BUILT_GATE_SPEC_JSON,
  DEFAULT_BLOCKED_SITES,
  DEFAULT_BLOCK_PAGE_ALTERNATIVES,
  DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES,
  DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
  DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
  GRAYSCALE_ACCESS_EFFECT_ID,
  DEFAULT_LLM_LEISURE_ALLOWANCE,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_REVIEW_STRICTNESS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_SHOW_CHATGPT_PEEK,
  DEFAULT_TEMP_ALLOW_MINUTES,
  LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID,
  LLM_REVIEWED_ACCESS_GATE_ACTION_ID,
} from "./defaults.js";
import {
  ACCESS_EFFECT_MODULES,
  normalizeAccessEffectIds,
} from "./access-effects/registry.js";
import {
  getExtensionStoreListing,
  isChromeLocalAiSupportedBrowser,
} from "./browser-compat.js";
import { normalizeGithubUsername } from "./gates/github-contribution/index.js";
import {
  normalizeBuiltGateSpecJson,
} from "./gates/built-gate/index.js";
import { GATE_MODULES } from "./gates/registry.js";
import { STORAGE_KEYS } from "./storage-constants.js";

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
const GITHUB_RECENT_WINDOW_MINUTES_MIN = 15;
const GITHUB_RECENT_WINDOW_MINUTES_MAX = 480;
const RETIRED_ACCESS_GATE_ACTION_IDS = new Set([
  LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID,
  "local-intent-request-access",
]);

type RangeLabels = Record<string, string>;

type NormalizedBlockedSites = {
  sites: string[];
  duplicateCount: number;
};

const normalizeAccessGateActionId = (actionId: unknown): string =>
  RETIRED_ACCESS_GATE_ACTION_IDS.has(String(actionId))
    ? DEFAULT_ACCESS_GATE_ACTION_ID
    : String(actionId || "");

const getFallbackLlmProvider = (): string =>
  isChromeLocalAiSupportedBrowser() ? DEFAULT_LLM_PROVIDER : "openai";

const normalizeLlmProvider = (provider: unknown): string => {
  if (provider === "openai") return "openai";
  if (provider === "chrome-local" && isChromeLocalAiSupportedBrowser()) {
    return "chrome-local";
  }
  return getFallbackLlmProvider();
};

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

const extractOpenAiOutputText = (data: unknown): string | null => {
  const response = data as any;
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  if (!Array.isArray(response?.output)) return null;
  for (const outputItem of response.output) {
    if (!Array.isArray(outputItem?.content)) continue;
    const textEntry = outputItem.content.find((entry: any) => entry?.type === "output_text");
    if (typeof textEntry?.text === "string" && textEntry.text.trim()) {
      return textEntry.text;
    }
  }
  return null;
};

const BUILT_GATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" },
    },
    requiredAnswerMinChars: { type: "number" },
    denyKeywords: {
      type: "array",
      items: { type: "string" },
    },
    approveKeywords: {
      type: "array",
      items: { type: "string" },
    },
    urlScopeKeywords: {
      type: "array",
      items: { type: "string" },
    },
    maxMinutes: { type: "number" },
    successMessage: { type: "string" },
    failureMessage: { type: "string" },
  },
  required: [
    "name",
    "description",
    "questions",
    "requiredAnswerMinChars",
    "denyKeywords",
    "approveKeywords",
    "urlScopeKeywords",
    "maxMinutes",
    "successMessage",
    "failureMessage",
  ],
};

const normalizeGithubContributionWindowMinutes = (value: unknown): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES;
  }
  return Math.min(
    Math.max(parsed, GITHUB_RECENT_WINDOW_MINUTES_MIN),
    GITHUB_RECENT_WINDOW_MINUTES_MAX
  );
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
  label.trim();

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

const renderAccessEffectOption = (
  effect: (typeof ACCESS_EFFECT_MODULES)[number]
) => `
  <label class="effect-card" for="access-effect-${escapeHtml(effect.id)}">
    <input
      type="checkbox"
      id="access-effect-${escapeHtml(effect.id)}"
      data-access-effect-id="${escapeHtml(effect.id)}"
    />
    <span class="effect-body">
      <span class="effect-title">${escapeHtml(effect.label)}</span>
      <span class="hint">${escapeHtml(effect.description)}</span>
      ${
        effect.timeline?.length
          ? `<ol class="effect-timeline" aria-label="${escapeHtml(effect.label)} timing">
              ${effect.timeline
                .map(
                  (step) => `
                    <li>
                      <span class="effect-step-when">
                        <span>${escapeHtml(step.atPercent)}%</span>
                        <span data-effect-step-time="${escapeHtml(step.atPercent)}"></span>
                      </span>
                      <span class="effect-step-copy">
                        <span class="effect-step-label">${escapeHtml(step.label)}</span>
                        <span class="hint">${escapeHtml(step.description)}</span>
                      </span>
                    </li>
                  `
                )
                .join("")}
            </ol>`
          : ""
      }
    </span>
  </label>
`;

const renderAccessEffectList = (effectList: HTMLElement) => {
  effectList.innerHTML = ACCESS_EFFECT_MODULES.map(renderAccessEffectOption).join("");
};

const renderTextField = (field: GateOptionsTextField) => `
  <div class="field" id="${escapeHtml(field.id)}-field">
    <label for="${escapeHtml(field.id)}">${escapeHtml(field.label)}</label>
    ${
      field.type === "textarea"
        ? `<textarea
            id="${escapeHtml(field.id)}"
            ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ""}
            ${field.rows ? `rows="${field.rows}"` : ""}
            spellcheck="true"
          ></textarea>`
        : `<input
            type="${escapeHtml(field.type)}"
            id="${escapeHtml(field.id)}"
            ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ""}
            ${field.autocomplete ? `autocomplete="${escapeHtml(field.autocomplete)}"` : ""}
          />`
    }
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

const renderButton = (button: GateOptionsButton) => `
  <button type="button" class="secondary-button" id="${escapeHtml(button.id)}">
    ${escapeHtml(button.label)}
  </button>
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
  const textFieldsMarkup = options.textFields?.length
    ? options.textFields.map(renderTextField).join("")
    : "";
  const buttonsMarkup = options.buttons?.length
    ? `<div class="sites-actions">${options.buttons.map(renderButton).join("")}</div>`
    : "";

  const statusMarkup = options.statusId
    ? `<p id="${escapeHtml(options.statusId)}" class="hint warning" aria-live="polite"></p>`
    : "";
  const panelMarkup =
    providerMarkup || rangeMarkup || textFieldsMarkup || buttonsMarkup || statusMarkup
      ? `<div class="llm-panel">
          ${providerMarkup}
          ${textFieldsMarkup}
          ${buttonsMarkup}
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
  const accessEffectList = document.getElementById("access-effect-list");
  const showPeekCheckbox = document.getElementById("show-chatgpt-peek");
  const gateList = document.getElementById("gate-list");
  const saveStatus = document.getElementById("save-status");
  const storeLink = document.getElementById("store-link");

  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !(cleanSitesBtn instanceof HTMLButtonElement) ||
    !(saveBtn instanceof HTMLButtonElement) ||
    !(minutesInput instanceof HTMLInputElement) ||
    !(alternativesInput instanceof HTMLTextAreaElement) ||
    !(accessEffectList instanceof HTMLElement) ||
    !(showPeekCheckbox instanceof HTMLInputElement) ||
    !(gateList instanceof HTMLElement)
  ) {
    return;
  }

  renderAccessEffectList(accessEffectList);
  renderGateLibrary(gateList);

  const storeListing = getExtensionStoreListing();
  if (storeLink instanceof HTMLAnchorElement) {
    if (storeListing) {
      storeLink.href = storeListing.url;
      storeLink.textContent = storeListing.label;
      storeLink.hidden = false;
    } else {
      storeLink.hidden = true;
    }
  }

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
  const githubContributionUsernameInput = document.getElementById("github-contribution-username");
  const githubContributionRecentWindowInput = document.getElementById(
    "github-contribution-recent-window-minutes"
  );
  const githubContributionRecentWindowLabel = document.getElementById(
    "github-contribution-recent-window-minutes-label"
  );
  const builtGatePromptInput = document.getElementById("built-gate-prompt");
  const builtGateSpecInput = document.getElementById("built-gate-spec");
  const generateBuiltGateButton = document.getElementById("generate-built-gate");
  const builtGateStatus = document.getElementById("built-gate-status");

  if (
    llmProviderInputs.length === 0 ||
    !llmProviderInputs.every((input) => input instanceof HTMLInputElement) ||
    !(llmReviewStrictnessInput instanceof HTMLInputElement) ||
    !(llmLeisureAllowanceInput instanceof HTMLInputElement) ||
    !(openAiModelInput instanceof HTMLInputElement) ||
    !(openAiApiKeyInput instanceof HTMLInputElement) ||
    !(githubContributionUsernameInput instanceof HTMLInputElement) ||
    !(githubContributionRecentWindowInput instanceof HTMLInputElement) ||
    !(builtGatePromptInput instanceof HTMLTextAreaElement) ||
    !(builtGateSpecInput instanceof HTMLTextAreaElement) ||
    !(generateBuiltGateButton instanceof HTMLButtonElement)
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

  const getAccessEffectInputs = (): HTMLInputElement[] =>
    Array.from(
      accessEffectList.querySelectorAll<HTMLInputElement>("[data-access-effect-id]")
    );

  const getSelectedAccessEffectIds = (): string[] =>
    normalizeAccessEffectIds(
      getAccessEffectInputs()
        .filter((input) => input.checked)
        .map((input) => input.getAttribute("data-access-effect-id"))
    );

  const setSelectedAccessEffectIds = (ids: unknown): void => {
    const selectedIds = new Set(normalizeAccessEffectIds(ids));
    getAccessEffectInputs().forEach((input) => {
      const id = input.getAttribute("data-access-effect-id");
      input.checked = !!id && selectedIds.has(id);
    });
  };

  const formatDurationSeconds = (totalSeconds: number): string => {
    const seconds = Math.max(Math.round(totalSeconds), 0);
    if (seconds === 0) return "start";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  };

  const getTemporaryAllowDurationSeconds = (): number => {
    const minutes = parseInt(minutesInput.value, 10) || DEFAULT_TEMP_ALLOW_MINUTES;
    return Math.max(minutes, 1) * 60;
  };

  const updateAccessEffectTimelineTimes = (): void => {
    const durationSeconds = getTemporaryAllowDurationSeconds();
    accessEffectList
      .querySelectorAll<HTMLElement>("[data-effect-step-time]")
      .forEach((timeElement) => {
        const percent = Number(timeElement.getAttribute("data-effect-step-time"));
        const seconds = durationSeconds * (Number.isFinite(percent) ? percent / 100 : 0);
        timeElement.textContent = formatDurationSeconds(seconds);
      });
  };

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

  const updateChromeLocalProviderAvailability = (): void => {
    const available = isChromeLocalAiSupportedBrowser();
    const chromeLocalInput = llmProviderInputs.find((input) => input.value === "chrome-local");
    const chromeLocalCard = document.querySelector('[data-provider-card="chrome-local"]');

    if (chromeLocalInput) {
      chromeLocalInput.disabled = !available;
      if (!available && chromeLocalInput.checked) {
        setSelectedLlmProvider("openai");
      }
    }

    if (chromeLocalCard instanceof HTMLElement) {
      chromeLocalCard.classList.toggle("is-disabled", !available);
      chromeLocalCard.title = available ? "" : "Chrome local AI is only available in Chrome.";
    }
  };

  const hasReadyLlmProviderConfig = (): boolean => {
    const provider = getSelectedLlmProvider();
    if (provider === "chrome-local") return isChromeLocalAiSupportedBrowser();
    return (
      openAiApiKeyInput.value.trim().length > 0 &&
      openAiModelInput.value.trim().length > 0
    );
  };

  const updateLlmConfigStatus = (): void => {
    if (!llmConfigStatus) return;
    updateChromeLocalProviderAvailability();
    const provider = getSelectedLlmProvider();
    const isChromeLocal = provider === "chrome-local";
    updateProviderCards();

    if (isChromeLocal) {
      if (!isChromeLocalAiSupportedBrowser()) {
        llmConfigStatus.textContent = "Chrome local AI is only available in Chrome.";
        llmConfigStatus.className = "hint warning";
        return;
      }
      llmConfigStatus.textContent =
        "Chrome local AI uses Gemini Nano on this device when the Prompt API is available.";
      llmConfigStatus.className = "hint ok";
      return;
    }

    const hasApiKey = openAiApiKeyInput.value.trim().length > 0;
    const hasModel = openAiModelInput.value.trim().length > 0;
    if (hasApiKey && hasModel) {
      llmConfigStatus.textContent =
        "AI-reviewed request gate is ready to use as the default gate.";
      llmConfigStatus.className = "hint ok";
      return;
    }

    llmConfigStatus.textContent = "Add an API key and model before using AI-reviewed request.";
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

  const updateGithubContributionRangeLabel = (): void => {
    const minutes = normalizeGithubContributionWindowMinutes(
      githubContributionRecentWindowInput.value
    );
    githubContributionRecentWindowInput.value = String(minutes);
    if (githubContributionRecentWindowLabel) {
      githubContributionRecentWindowLabel.textContent = `${minutes} minutes`;
    }
  };

  const setBuiltGateStatus = (message: string, className = "hint"): void => {
    if (!builtGateStatus) return;
    builtGateStatus.textContent = message;
    builtGateStatus.className = className;
  };

  const generateBuiltGateSpec = async (): Promise<void> => {
    const prompt = builtGatePromptInput.value.trim();
    const apiKey = openAiApiKeyInput.value.trim();
    const model = normalizeOpenAiModel(openAiModelInput.value);

    if (!prompt) {
      setBuiltGateStatus("Describe the gate you want first.", "hint warning");
      return;
    }
    if (!apiKey) {
      setBuiltGateStatus("Add an OpenAI API key before generating a gate.", "hint warning");
      return;
    }

    generateBuiltGateButton.disabled = true;
    generateBuiltGateButton.textContent = "Generating...";
    setBuiltGateStatus("Generating a dynamic gate program...", "hint");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          store: false,
          max_output_tokens: 900,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "Create a NoDrift dynamic gate program. Return JSON only. The gate should be humane, specific, and hard to satisfy with vague feed-seeking.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    requestedGate: prompt,
                    schemaNotes: {
                      questions:
                        "Prompts shown to the user. Make them line labels ending with a colon.",
                      approveKeywords:
                        "Words or phrases that indicate intentional use.",
                      denyKeywords:
                        "Words or phrases that indicate autopilot or avoidance.",
                      urlScopeKeywords:
                        "Words or phrases that should prefer exact-page access.",
                    },
                  }),
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "nodrift_dynamic_gate",
              strict: true,
              schema: BUILT_GATE_JSON_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 180)}`);
      }

      const outputText = extractOpenAiOutputText(await response.json());
      if (!outputText) {
        throw new Error("Provider response did not include gate JSON.");
      }
      builtGateSpecInput.value = normalizeBuiltGateSpecJson(outputText);
      setBuiltGateStatus("Generated. Save settings to use this gate.", "hint ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBuiltGateStatus(`Could not generate gate: ${message}`, "hint danger");
    } finally {
      generateBuiltGateButton.disabled = false;
      generateBuiltGateButton.textContent = "Generate gate";
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
        [STORAGE_KEYS.accessEffectIds]: null,
        grayscaleOnTemporaryAllow: DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
        llmProvider: DEFAULT_LLM_PROVIDER,
        llmReviewStrictness: DEFAULT_LLM_REVIEW_STRICTNESS,
        llmLeisureAllowance: DEFAULT_LLM_LEISURE_ALLOWANCE,
        openAiModel: DEFAULT_OPENAI_MODEL,
        [STORAGE_KEYS.githubContributionUsername]: DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
        [STORAGE_KEYS.githubContributionRecentWindowMinutes]:
          DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES,
        [STORAGE_KEYS.builtGatePrompt]: "",
        [STORAGE_KEYS.builtGateSpec]: DEFAULT_BUILT_GATE_SPEC_JSON,
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
          setSelectedAccessEffectIds(
            normalizeAccessEffectIds(
              syncData[STORAGE_KEYS.accessEffectIds],
              syncData.grayscaleOnTemporaryAllow === false ? [] : DEFAULT_ACCESS_EFFECT_IDS
            )
          );

          setSelectedLlmProvider(syncData.llmProvider);
          llmReviewStrictnessInput.value = normalizeLlmReviewStrictness(syncData.llmReviewStrictness);
          llmLeisureAllowanceInput.value = normalizeLlmReviewStrictness(syncData.llmLeisureAllowance);
          openAiModelInput.value = normalizeOpenAiModel(syncData.openAiModel);
          githubContributionUsernameInput.value =
            normalizeGithubUsername(syncData[STORAGE_KEYS.githubContributionUsername]) ??
            DEFAULT_GITHUB_CONTRIBUTION_USERNAME;
          githubContributionRecentWindowInput.value = String(
            normalizeGithubContributionWindowMinutes(
              syncData[STORAGE_KEYS.githubContributionRecentWindowMinutes]
            )
          );
          builtGatePromptInput.value = String(syncData[STORAGE_KEYS.builtGatePrompt] || "");
          builtGateSpecInput.value = normalizeBuiltGateSpecJson(
            syncData[STORAGE_KEYS.builtGateSpec]
          );
          openAiApiKeyInput.value =
            typeof localData.openAiApiKey === "string" ? localData.openAiApiKey : "";
          updateSitesSummary();
          updateReviewRangeLabels();
          updateGithubContributionRangeLabel();
          updateGateLibraryState();
          updateAccessEffectTimelineTimes();
        });
      }
    );
  };

  loadSettings();

  textarea.addEventListener("input", updateSitesSummary);
  minutesInput.addEventListener("input", updateAccessEffectTimelineTimes);
  cleanSitesBtn.addEventListener("click", cleanSitesInput);
  openAiApiKeyInput.addEventListener("input", updateGateLibraryState);
  openAiModelInput.addEventListener("input", updateGateLibraryState);
  llmProviderInputs.forEach((input) => {
    input.addEventListener("change", updateGateLibraryState);
  });
  llmReviewStrictnessInput.addEventListener("input", updateReviewRangeLabels);
  llmLeisureAllowanceInput.addEventListener("input", updateReviewRangeLabels);
  githubContributionRecentWindowInput.addEventListener(
    "input",
    updateGithubContributionRangeLabel
  );
  generateBuiltGateButton.addEventListener("click", () => {
    generateBuiltGateSpec();
  });

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
    const accessEffectIds = getSelectedAccessEffectIds();
    const grayscaleOnTemporaryAllow = accessEffectIds.includes(GRAYSCALE_ACCESS_EFFECT_ID);
    const showChatGptPeek = Boolean(showPeekCheckbox.checked);
    const llmProvider = getSelectedLlmProvider();
    const llmReviewStrictness = normalizeLlmReviewStrictness(llmReviewStrictnessInput.value);
    const llmLeisureAllowance = normalizeLlmReviewStrictness(llmLeisureAllowanceInput.value);
    const openAiModel = normalizeOpenAiModel(openAiModelInput.value);
    const openAiApiKey = openAiApiKeyInput.value.trim();
    const githubContributionUsername =
      normalizeGithubUsername(githubContributionUsernameInput.value) ??
      DEFAULT_GITHUB_CONTRIBUTION_USERNAME;
    const githubContributionRecentWindowMinutes =
      normalizeGithubContributionWindowMinutes(githubContributionRecentWindowInput.value);
    let builtGateSpec = DEFAULT_BUILT_GATE_SPEC_JSON;
    try {
      builtGateSpec = normalizeBuiltGateSpecJson(builtGateSpecInput.value);
      setBuiltGateStatus("", "hint");
    } catch {
      setBuiltGateStatus("Gate program JSON is invalid. Fix it before saving.", "hint danger");
      return;
    }
    githubContributionUsernameInput.value = githubContributionUsername;
    githubContributionRecentWindowInput.value = String(githubContributionRecentWindowMinutes);
    builtGateSpecInput.value = builtGateSpec;
    updateGithubContributionRangeLabel();

    chrome.storage.sync.set(
      {
        blockedSites: normalizedSites,
        tempAllowMinutes: minutes,
        accessGateActionId,
        showChatGptPeek,
        blockPageAlternatives,
        [STORAGE_KEYS.accessEffectIds]: accessEffectIds,
        grayscaleOnTemporaryAllow,
        llmProvider,
        llmReviewStrictness,
        llmLeisureAllowance,
        openAiModel,
        [STORAGE_KEYS.githubContributionUsername]: githubContributionUsername,
        [STORAGE_KEYS.githubContributionRecentWindowMinutes]:
          githubContributionRecentWindowMinutes,
        [STORAGE_KEYS.builtGatePrompt]: builtGatePromptInput.value.trim(),
        [STORAGE_KEYS.builtGateSpec]: builtGateSpec,
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
