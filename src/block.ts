import { ALARM_NAMES, STORAGE_KEYS } from "./storage-constants.js";
import {
  DEFAULT_ACCESS_EFFECT_IDS,
  DEFAULT_ACCESS_GATE_ACTION_ID,
  BUILT_GATE_ACCESS_GATE_ACTION_ID,
  DEFAULT_BUILT_GATE_SPEC_JSON,
  DEFAULT_BLOCKED_SITES,
  DEFAULT_BLOCK_PAGE_ALTERNATIVES,
  DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
  DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
  DEFAULT_INCREASING_ALLOW_DELAY_ENABLED,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_SHOW_CHATGPT_PEEK,
  DEFAULT_TEMP_ALLOW_MINUTES,
  LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID,
  LLM_REVIEWED_ACCESS_GATE_ACTION_ID,
} from "./defaults.js";
import {
  ensureFirefoxDataCollectionConsent,
  FIREFOX_PEEK_CHATGPT_DATA_COLLECTION_PERMISSIONS,
} from "./data-collection-consent.js";
import {
  buildAccessEffectCss,
  buildAccessEffectOverlayCss,
  getAccessEffectMilestones,
  normalizeAccessEffectIds,
} from "./access-effects/registry.js";
import type { AccessEffectSession } from "./access-effects/types.js";
import {
  AccessGateDecision,
  AccessReviewProgressStage,
  BlockPageActionCapability,
} from "./core/access-contracts.js";
import {
  DNR_ACTION_ALLOW,
  DNR_ACTION_REDIRECT,
  DNR_RESOURCE_MAIN_FRAME,
  getDnrExtensionRedirectTransformBase,
  isChromeLocalAiSupportedBrowser,
  isExtensionPageUrl,
} from "./browser-compat.js";
import { decideAiStudyQuizRequest } from "./gates/ai-study-quiz/request.js";
import {
  normalizeBuiltGateSpec,
} from "./gates/built-gate/index.js";
import { decideBuiltGateRequest } from "./gates/built-gate/request.js";
import { decideGithubContributionRequest } from "./gates/github-contribution/request.js";
import { normalizeGithubUsername } from "./gates/github-contribution/index.js";
import { decideIfThenIntentionRequest } from "./gates/if-then-intention/request.js";
import { temporaryAllowGate } from "./gates/temporary-allow/index.js";
import { decideLlmReviewedRequest } from "./gates/llm-reviewed/request.js";
import { GATE_BLOCK_PAGE_ACTION_CAPABILITIES } from "./gates/registry.js";
import { buildDecisionApplication } from "./core/decision-application.js";
import { BLOCK_PAGE_ACTION_CAPABILITIES, OPTIONAL_INTEGRATIONS } from "./block-page/block-page-capabilities.js";
import {
  createEmptyDailyStats,
  DailyBlockerStats,
  buildAccessGateStatsContext,
  getLocalDayKey,
  normalizeDailyStats,
  withAccessRequested,
  withBlockedAttempt,
  withRequestGateDecision,
  withTemporaryAllow,
  withTemporaryAllowUsedSeconds,
} from "./stats.js";
import { getTemporarilyAllowedDestination } from "./temp-allow-destination.js";
import {
  buildTemporaryAllowDelayTargetKey,
  evaluateTemporaryAllowDelay,
  normalizePendingTemporaryAllowDelay,
  type PendingTemporaryAllowDelay,
} from "./temporary-allow-delay.js";
import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "./gates/shared/request-runtime.js";
import {
  buildExactUrlRegexFilter,
  buildParentDomainUrlFilter,
} from "./url-filters.js";
import {
  ensureHttpUrl,
  normalizeHost,
  parseHostnameFromUrl,
  parseSiteFromSender,
  sanitizeSite,
} from "./url-domain.js";
import { findRuleIdByHostname } from "./site-matching.js";

const ACCESS_GATE_ACTION_IDS = new Set(
  GATE_BLOCK_PAGE_ACTION_CAPABILITIES.map((action) => action.id)
);
const RETIRED_ACCESS_GATE_ACTION_IDS = new Set([
  LEGACY_AGENTIC_ACCESS_GATE_ACTION_ID,
  "local-intent-request-access",
]);

type ChromeTab = {
  id?: number;
  url?: string | null;
  pendingUrl?: string | null;
  active?: boolean;
};

type DynamicRule = {
  id: number;
};

type StorageItems = Record<string, any>;
type StorageChanges = Record<string, { newValue: any; oldValue?: any }>;
type SendResponse = (response?: any) => void;

let blockedSites = [...DEFAULT_BLOCKED_SITES];
let tempAllowMinutes: number | null = null;
let blockedSitesLoaded = false;
let temporaryAllowStateLoaded = false;
let dailyStatsUpdateQueue: Promise<unknown> = Promise.resolve();
let temporaryAllowRequestQueue: Promise<unknown> = Promise.resolve();

let selectedAccessEffectIds = [...DEFAULT_ACCESS_EFFECT_IDS];

const ACCESS_EFFECT_STYLE_ID = "nodrift-access-effects-style";
const ACCESS_EFFECT_OVERLAY_ID = "nodrift-access-effects-overlay";
type TemporaryAllowWindow = {
  expiresAt: number;
  startedAt: number;
  source?: string | null;
};
const grayscaleHosts = new Map<string, TemporaryAllowWindow>();
type TemporaryUrlAllowWindow = TemporaryAllowWindow & {
  id: number;
  url: string;
  host: string;
};
const TEMP_URL_ALLOW_RULE_ID_BASE = 100000;
const temporarilyAllowedUrls = new Map<number, TemporaryUrlAllowWindow>();

const TEMP_ALLOW_BADGE_COLOR = "#f59e0b";
type TemporaryAllowUsageSession = {
  host: string;
  touchedAt: number;
};
let activeTemporaryAllowUsageSession: TemporaryAllowUsageSession | null = null;
let activeTemporaryAllowUsageSessionLoaded = false;
let temporaryAllowUsageSessionQueue: Promise<unknown> = Promise.resolve();

const scheduleBadgeRefreshAlarm = () => {
  chrome.alarms.create(ALARM_NAMES.badgeRefresh, { periodInMinutes: 1 });
};

type LastNavigatedUrlEntry = {
  url: string;
  updatedAt: number;
  blockedAttemptRecordedAt: number | null;
};
const lastNavigatedUrlByTab = new Map<number, LastNavigatedUrlEntry>();


const setLastNavigatedUrlForTab = (
  tabId: number,
  url: string,
  resetBlockedAttempt = true
) => {
  const previousEntry = lastNavigatedUrlByTab.get(tabId);
  lastNavigatedUrlByTab.set(tabId, {
    url,
    updatedAt: Date.now(),
    blockedAttemptRecordedAt: resetBlockedAttempt
      ? null
      : previousEntry?.blockedAttemptRecordedAt ?? null,
  });
};

const recordLastNavigatedUrl = (tabId: number, rawUrl?: string | null) => {
  if (isExtensionPageUrl(rawUrl)) {
    return;
  }
  const normalised = ensureHttpUrl(rawUrl);
  if (!normalised) return;
  setLastNavigatedUrlForTab(tabId, normalised);
};

const getLastNavigatedUrlForTab = (tabId: number): string | null =>
  lastNavigatedUrlByTab.get(tabId)?.url ?? null;

const markBlockedAttemptRecordedForTab = (
  tabId: number,
  recordedAt = Date.now()
): boolean => {
  const entry = lastNavigatedUrlByTab.get(tabId);
  if (!entry) return true;
  if (
    entry.blockedAttemptRecordedAt !== null &&
    entry.blockedAttemptRecordedAt >= entry.updatedAt
  ) {
    return false;
  }
  entry.blockedAttemptRecordedAt = recordedAt;
  return true;
};

const getTabNavigatedHttpUrl = (tabId: number): Promise<string | null> =>
  new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab: any) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "getTabNavigatedHttpUrl tabs.get failed",
          chrome.runtime.lastError.message
        );
        resolve(null);
        return;
      }

      const pending = ensureHttpUrl(tab?.pendingUrl);
      if (pending) {
        resolve(pending);
        return;
      }

      const current = ensureHttpUrl(tab?.url);
      resolve(current);
    });
  });

chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab?: any) => {
  if (changeInfo?.pendingUrl) {
    recordLastNavigatedUrl(tabId, changeInfo.pendingUrl);
  }
  if (changeInfo?.url) {
    recordLastNavigatedUrl(tabId, changeInfo.url);
    if (tab?.active) refreshBadgeForActiveTab();
    if (tab?.active) refreshActiveTemporaryAllowUsage();
    return;
  }
  if (changeInfo?.status === "complete" && tab?.url) {
    recordLastNavigatedUrl(tabId, tab.url);
    if (tab?.active) refreshBadgeForActiveTab();
    if (tab?.active) refreshActiveTemporaryAllowUsage();
    return;
  }
  if (!changeInfo?.status && tab?.url) {
    recordLastNavigatedUrl(tabId, tab.url);
  }
  if (tab?.active) refreshBadgeForActiveTab();
  if (tab?.active) refreshActiveTemporaryAllowUsage();
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  lastNavigatedUrlByTab.delete(tabId);
  refreshBadgeForActiveTab();
  refreshActiveTemporaryAllowUsage();
});

chrome.tabs.onActivated.addListener(() => {
  refreshBadgeForActiveTab();
  refreshActiveTemporaryAllowUsage();
});

if (chrome.windows?.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId: number) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      void stopActiveTemporaryAllowUsage();
      return;
    }
    refreshActiveTemporaryAllowUsage();
  });
}

if (chrome.webNavigation?.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((details: any) => {
    if (details?.frameId !== 0) return;
    recordLastNavigatedUrl(details.tabId, details.url);
  });
}

if (chrome.webNavigation?.onCommitted) {
  chrome.webNavigation.onCommitted.addListener((details: any) => {
    if (details?.frameId !== 0) return;
    recordLastNavigatedUrl(details.tabId, details.url);
    syncAccessEffectsForUrl(details.tabId, details.url);
  });
}

if (chrome.webNavigation?.onCompleted) {
  chrome.webNavigation.onCompleted.addListener((details: any) => {
    if (details?.frameId !== 0) return;
    syncAccessEffectsForUrl(details.tabId, details.url);
  });
}

const getTempAllowMinutes = (): Promise<number> =>
  new Promise((resolve) => {
    if (tempAllowMinutes !== null) {
      resolve(tempAllowMinutes);
    } else {
      chrome.storage.sync.get({ [STORAGE_KEYS.tempAllowMinutes]: DEFAULT_TEMP_ALLOW_MINUTES }, (data: StorageItems) => {
        const minutes = Number(data[STORAGE_KEYS.tempAllowMinutes]) || DEFAULT_TEMP_ALLOW_MINUTES;
        tempAllowMinutes = minutes;
        resolve(minutes);
      });
    }
  });

const getDailyStats = (): Promise<DailyBlockerStats> =>
  new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEYS.localDailyStats]: null }, (items: StorageItems) => {
      resolve(normalizeDailyStats(items[STORAGE_KEYS.localDailyStats]));
    });
  });

const setDailyStats = (stats: DailyBlockerStats): Promise<void> =>
  new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.localDailyStats]: stats }, () => resolve());
  });

const updateDailyStatsNow = async (
  mutate: (stats: DailyBlockerStats) => DailyBlockerStats
): Promise<DailyBlockerStats> => {
  const current = await getDailyStats();
  const updated = normalizeDailyStats(mutate(current));
  await setDailyStats(updated);
  return updated;
};

const updateDailyStats = async (
  mutate: (stats: DailyBlockerStats) => DailyBlockerStats
): Promise<DailyBlockerStats> => {
  const queued = dailyStatsUpdateQueue.then(
    () => updateDailyStatsNow(mutate),
    () => updateDailyStatsNow(mutate)
  );
  dailyStatsUpdateQueue = queued.catch(() => undefined);
  return queued;
};

type BlockPageActionView = BlockPageActionCapability & {
  disabledReason?: string;
  reviewerLabel?: string | null;
};

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

const normalizeBlockPageAlternatives = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeAlternativeLine(String(item).trim())).filter(Boolean)
    : DEFAULT_BLOCK_PAGE_ALTERNATIVES;

const normalizeAccessGateActionId = (actionId: unknown): string => {
  if (RETIRED_ACCESS_GATE_ACTION_IDS.has(String(actionId))) {
    return DEFAULT_ACCESS_GATE_ACTION_ID;
  }
  return typeof actionId === "string" ? actionId : DEFAULT_ACCESS_GATE_ACTION_ID;
};

const getBlockPageActionCapability = (
  actionId: string
): BlockPageActionCapability | null =>
  BLOCK_PAGE_ACTION_CAPABILITIES.find((action) => action.id === actionId) ?? null;

const getAccessGateActionCapability = (
  actionId: string
): BlockPageActionCapability | null =>
  GATE_BLOCK_PAGE_ACTION_CAPABILITIES.find((action) => action.id === actionId) ?? null;

const getSyncStorageItems = (
  defaults: Record<string, unknown>
): Promise<StorageItems> =>
  new Promise((resolve) => {
    chrome.storage.sync.get(defaults, (items: StorageItems) => resolve(items));
  });

const getLocalStorageItems = (
  defaults: Record<string, unknown>
): Promise<StorageItems> =>
  new Promise((resolve) => {
    chrome.storage.local.get(defaults, (items: StorageItems) => resolve(items));
  });

const formatLlmReviewerLabel = (provider: string, model: string): string => {
  if (provider === "chrome-local") {
    return isChromeLocalAiSupportedBrowser()
      ? "Provider: Chrome local Nano"
      : "Provider: Chrome local AI unavailable in Firefox";
  }
  const modelLabel =
    typeof model === "string" && model.trim().length > 0 ? model.trim() : DEFAULT_OPENAI_MODEL;
  return `Provider: OpenAI · ${modelLabel}`;
};

const getBlockPageActions = async (): Promise<{
  ok: true;
  primaryActions: BlockPageActionView[];
  secondaryActions: BlockPageActionView[];
  alternativeItems: string[];
  accessGateActions: BlockPageActionCapability[];
}> => {
  const syncData = await getSyncStorageItems({
    [STORAGE_KEYS.accessGateActionId]: DEFAULT_ACCESS_GATE_ACTION_ID,
    [STORAGE_KEYS.showChatGptPeek]: DEFAULT_SHOW_CHATGPT_PEEK,
    [STORAGE_KEYS.blockPageAlternatives]: DEFAULT_BLOCK_PAGE_ALTERNATIVES,
    [STORAGE_KEYS.llmProvider]: DEFAULT_LLM_PROVIDER,
    [STORAGE_KEYS.openAiModel]: DEFAULT_OPENAI_MODEL,
    [STORAGE_KEYS.githubContributionUsername]: DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
    [STORAGE_KEYS.builtGateSpec]: DEFAULT_BUILT_GATE_SPEC_JSON,
  });
  const localData = await getLocalStorageItems({ [STORAGE_KEYS.openAiApiKey]: "" });

  const provider = String(syncData[STORAGE_KEYS.llmProvider] || DEFAULT_LLM_PROVIDER);
  const model = String(syncData[STORAGE_KEYS.openAiModel] || DEFAULT_OPENAI_MODEL);
  const apiKey = String(localData[STORAGE_KEYS.openAiApiKey] || "");
  const githubContributionUsername =
    normalizeGithubUsername(syncData[STORAGE_KEYS.githubContributionUsername]) ??
    DEFAULT_GITHUB_CONTRIBUTION_USERNAME;
  let builtGateSpec = normalizeBuiltGateSpec(DEFAULT_BUILT_GATE_SPEC_JSON);
  try {
    builtGateSpec = normalizeBuiltGateSpec(syncData[STORAGE_KEYS.builtGateSpec]);
  } catch {
    // Fall back to the packaged gate if editable JSON in storage is malformed.
  }
  const llmConfigured =
    (provider === "chrome-local" && isChromeLocalAiSupportedBrowser()) ||
    (provider === "openai" && model.trim().length > 0 && apiKey.trim().length > 0);

  const normalizedActionId = normalizeAccessGateActionId(
    syncData[STORAGE_KEYS.accessGateActionId]
  );
  const configuredActionId = ACCESS_GATE_ACTION_IDS.has(normalizedActionId)
    ? normalizedActionId
    : DEFAULT_ACCESS_GATE_ACTION_ID;
  const primaryAction = getAccessGateActionCapability(configuredActionId);
  const reviewerLabel =
    primaryAction?.id === LLM_REVIEWED_ACCESS_GATE_ACTION_ID ||
    primaryAction?.id === "ai-study-quiz-request-access"
      ? formatLlmReviewerLabel(provider, model)
      : null;
  const effectivePrimaryAction: BlockPageActionView | null =
    primaryAction?.id === LLM_REVIEWED_ACCESS_GATE_ACTION_ID && !llmConfigured
      ? {
          ...primaryAction,
          reviewerLabel,
          label: "AI-reviewed request (setup required)",
          disabledReason:
            "AI-reviewed request is selected, but provider settings are incomplete. Check AI provider settings in Options.",
        }
      : primaryAction?.id === "ai-study-quiz-request-access" && !llmConfigured
      ? {
          ...primaryAction,
          reviewerLabel,
          label: "AI study quiz (setup required)",
          disabledReason:
            "AI study quiz is selected, but provider settings are incomplete. Check AI provider settings in Options.",
        }
      : primaryAction
      ? {
          ...primaryAction,
          reviewerLabel,
          ...(primaryAction.id === BUILT_GATE_ACCESS_GATE_ACTION_ID
            ? {
                label: builtGateSpec.name,
                formTitle: builtGateSpec.name,
                formInitialValue: builtGateSpec.questions.join("\n"),
                formPlaceholder: "Fill in each line before requesting access.",
              }
            : {}),
          ...(primaryAction.id === "github-contribution-request-access" &&
          githubContributionUsername
            ? {
                formInitialValue: githubContributionUsername,
                formPlaceholder: "GitHub username",
              }
            : {}),
        }
      : null;

  const secondaryActionIds = [
    syncData[STORAGE_KEYS.showChatGptPeek] !== false ? "peek-chatgpt" : null,
  ];
  const secondaryActions = secondaryActionIds
    .map((actionId): BlockPageActionView | null => {
      if (!actionId) return null;
      const action = getBlockPageActionCapability(actionId);
      if (!action) return null;
      return { ...action };
    })
    .filter((action): action is BlockPageActionView => !!action);

  return {
    ok: true,
    primaryActions: effectivePrimaryAction ? [effectivePrimaryAction] : [],
    secondaryActions,
    alternativeItems: normalizeBlockPageAlternatives(
      syncData[STORAGE_KEYS.blockPageAlternatives]
    ),
    accessGateActions: GATE_BLOCK_PAGE_ACTION_CAPABILITIES,
  };
};

// ---------- Rule builder ----------

const buildRule = (
  site: string,
  id: number
): any => {
  const extensionRedirectBase = getDnrExtensionRedirectTransformBase();
  return {
    id,
    // Give more specific domains higher priority so subdomains override their base domain.
    priority: site.split(".").length,
    action: {
      type: DNR_ACTION_REDIRECT,
      // Use transform so we can attach query params identifying the rule+site.
      redirect: {
        transform: {
          ...extensionRedirectBase,
          path: "/pages/block.html",
          queryTransform: {
            addOrReplaceParams: [
              { key: "rid", value: String(id) },
              { key: "site", value: site },
            ],
          },
        },
      },
    },
    condition: {
      // Match at the domain boundary (handles subdomains properly).
      urlFilter: buildParentDomainUrlFilter(site),
      resourceTypes: [DNR_RESOURCE_MAIN_FRAME],
    },
  };
};

const buildUrlAllowRule = (id: number, rawUrl: string): any => ({
  id,
  priority: 10000,
  action: {
    type: DNR_ACTION_ALLOW,
  },
  condition: {
    regexFilter: buildExactUrlRegexFilter(rawUrl),
    resourceTypes: [DNR_RESOURCE_MAIN_FRAME],
  },
});

const buildRules = (sites: string[]): any[] =>
  sites.map((site, idx) => buildRule(site, idx + 1));

const allRuleIds = () => blockedSites.map((_, idx) => idx + 1);

const buildBlockPageUrl = (site: string, id: number): string => {
  const params = new URLSearchParams({
    rid: String(id),
    site,
  });
  return chrome.runtime.getURL(`pages/block.html?${params.toString()}`);
};

const activeTemporaryAllowRuleIds = (): Set<number> => {
  const ids = new Set<number>();
  for (let i = 0; i < blockedSites.length; i++) {
    if (isHostTemporarilyAllowed(blockedSites[i])) {
      ids.add(i + 1);
    }
  }
  return ids;
};

const buildRulesForCurrentState = (): any[] => {
  const allowedIds = activeTemporaryAllowRuleIds();
  const blockedRules = blockedSites.flatMap((site, idx) => {
    const id = idx + 1;
    return allowedIds.has(id) ? [] : [buildRule(site, id)];
  });
  const urlAllowRules = Array.from(temporarilyAllowedUrls.values()).map((allow) =>
    buildUrlAllowRule(allow.id, allow.url)
  );
  return [...blockedRules, ...urlAllowRules];
};

// ---------- Utilities ----------

console.log("Website blocker: Service Worker Loaded");


const withLastErrorLog =
  (label: string, next?: () => void) =>
  () => {
    if (chrome.runtime.lastError) {
      console.warn(`[${label}]`, chrome.runtime.lastError.message);
    }
    next?.();
  };

const TEMPORARILY_ALLOW_CONTEXT_MENU_ID = "temporarily-allow";
const TEMPORARILY_ALLOW_CONTEXT_MENU_TITLE = "Temporarily allow this site";

const setTemporaryAllowContextMenuTitle = (title: string) => {
  chrome.contextMenus.update(
    TEMPORARILY_ALLOW_CONTEXT_MENU_ID,
    { title },
    withLastErrorLog("contextMenus.update(temporary allow)")
  );
};

const updateDynamicRulesAsync = (
  options: any
): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(options, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

const grayscaleStorageGet = (
  defaults: Record<string, unknown>,
  callback: (items: Record<string, unknown>) => void
) => {
  if (chrome.storage?.session?.get) {
    chrome.storage.session.get(defaults, callback);
  } else {
    chrome.storage.local.get(defaults, callback);
  }
};

const grayscaleStorageSet = (
  items: Record<string, unknown>,
  callback?: () => void
) => {
  if (chrome.storage?.session?.set) {
    chrome.storage.session.set(items, callback);
  } else {
    chrome.storage.local.set(items, callback);
  }
};

const persistGrayscaleHosts = () => {
  const entries = Array.from(grayscaleHosts.entries()).map(([host, window]) => [
    host,
    window.expiresAt,
    window.startedAt,
    window.source ?? null,
  ]);
  grayscaleStorageSet({ [STORAGE_KEYS.temporarilyAllowedGrayscaleHosts]: entries });
};

const normalizeTemporaryAllowUrl = (rawUrl?: string | null): string | null => {
  const url = ensureHttpUrl(rawUrl);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeTemporaryUrlAllowEntry = (
  entry: unknown
): TemporaryUrlAllowWindow | null => {
  if (!Array.isArray(entry) || (entry.length !== 5 && entry.length !== 6)) return null;
  const [rawId, rawUrl, rawHost, rawExpiresAt, rawStartedAt, rawSource] = entry;
  if (typeof rawId !== "number" || !Number.isInteger(rawId)) return null;
  const url = normalizeTemporaryAllowUrl(typeof rawUrl === "string" ? rawUrl : null);
  const host = normalizeHost(typeof rawHost === "string" ? rawHost : null);
  if (!url || !host) return null;
  if (typeof rawExpiresAt !== "number" || !Number.isFinite(rawExpiresAt)) return null;
  if (typeof rawStartedAt !== "number" || !Number.isFinite(rawStartedAt)) return null;
  if (rawId < TEMP_URL_ALLOW_RULE_ID_BASE) return null;
  return {
    id: rawId,
    url,
    host,
    expiresAt: rawExpiresAt,
    startedAt: rawStartedAt,
    source: typeof rawSource === "string" ? rawSource : null,
  };
};

const persistTemporarilyAllowedUrls = () => {
  const entries = Array.from(temporarilyAllowedUrls.values()).map((allow) => [
    allow.id,
    allow.url,
    allow.host,
    allow.expiresAt,
    allow.startedAt,
    allow.source ?? null,
  ]);
  grayscaleStorageSet({ [STORAGE_KEYS.temporarilyAllowedUrls]: entries });
};

const isHostTemporarilyAllowed = (host: string): boolean => {
  const now = Date.now();
  for (const [storedHost, window] of grayscaleHosts.entries()) {
    if (window.expiresAt <= now) continue;
    if (host === storedHost || host.endsWith(`.${storedHost}`)) {
      return true;
    }
  }
  return false;
};

const isUrlTemporarilyAllowed = (rawUrl?: string | null): boolean => {
  const url = normalizeTemporaryAllowUrl(rawUrl);
  if (!url) return false;
  const now = Date.now();
  for (const allow of temporarilyAllowedUrls.values()) {
    if (allow.expiresAt > now && allow.url === url) {
      return true;
    }
  }
  return false;
};

const getTemporaryAllowMatchForUrl = (
  rawUrl?: string | null
): TemporaryUrlAllowWindow | null => {
  const url = normalizeTemporaryAllowUrl(rawUrl);
  if (!url) return null;
  const now = Date.now();
  for (const allow of temporarilyAllowedUrls.values()) {
    if (allow.expiresAt > now && allow.url === url) {
      return allow;
    }
  }
  return null;
};

const getTemporaryAllowMatchForHost = (
  host: string
): { host: string; window: TemporaryAllowWindow } | null => {
  const now = Date.now();
  let bestMatchLength = -1;
  let bestMatch: { host: string; window: TemporaryAllowWindow } | null = null;
  for (const [storedHost, window] of grayscaleHosts.entries()) {
    if (window.expiresAt <= now) continue;
    if (host !== storedHost && !host.endsWith(`.${storedHost}`)) continue;
    if (storedHost.length <= bestMatchLength) continue;
    bestMatchLength = storedHost.length;
    bestMatch = { host: storedHost, window };
  }
  return bestMatch;
};

const getTemporaryAllowWindowForHost = (
  host: string
): TemporaryAllowWindow | null => getTemporaryAllowMatchForHost(host)?.window ?? null;

const getTemporaryAllowWindowForUrl = (
  rawUrl?: string | null
): TemporaryAllowWindow | null => {
  const host = parseHostnameFromUrl(rawUrl);
  const hostWindow = host ? getTemporaryAllowWindowForHost(host) : null;
  return hostWindow ?? getTemporaryAllowMatchForUrl(rawUrl);
};

const getTemporaryAllowedHostFromUrl = (rawUrl?: string | null): string | null => {
  const host = parseHostnameFromUrl(rawUrl);
  if (!host) return null;
  return (
    getTemporaryAllowMatchForHost(host)?.host ??
    (isUrlTemporarilyAllowed(rawUrl) ? host : null)
  );
};

const getBlockingRuleForUrl = (
  rawUrl?: string | null
): { id: number; site: string } | null => {
  const host = parseHostnameFromUrl(rawUrl);
  if (!host) return null;
  if (isHostTemporarilyAllowed(host) || isUrlTemporarilyAllowed(rawUrl)) {
    return null;
  }

  const id = findRuleIdByHostname(host, blockedSites);
  if (!id) return null;
  const site = blockedSites[id - 1];
  return site ? { id, site } : null;
};

const redirectTabToBlockPageIfNeeded = (tab: ChromeTab) => {
  if (typeof tab.id !== "number") return;
  const currentUrl = tab.url ?? tab.pendingUrl;
  const rule = getBlockingRuleForUrl(currentUrl);
  if (!rule) return;

  const navigatedUrl = ensureHttpUrl(currentUrl);
  if (navigatedUrl) {
    setLastNavigatedUrlForTab(tab.id, navigatedUrl, false);
  }

  chrome.tabs.update(
    tab.id,
    { url: buildBlockPageUrl(rule.site, rule.id) },
    withLastErrorLog("tabs.update(block expired temporary allow)")
  );
};

const queryTabsForHost = (
  host: string,
  callback: (tabs: ChromeTab[]) => void
) => {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query(
    { url: [`*://${host}/*`, `*://*.${host}/*`] },
    (tabs: ChromeTab[]) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[tabs.query(block expired temporary allow)]",
          chrome.runtime.lastError.message
        );
        return;
      }
      callback(tabs);
    }
  );
};

const redirectBlockedTabsForHost = (rawHost: string) => {
  const host = normalizeHost(rawHost);
  if (!host) return;
  queryTabsForHost(host, (tabs) => {
    tabs.forEach(redirectTabToBlockPageIfNeeded);
  });
};

const redirectBlockedTabsForTemporaryUrl = (allow: TemporaryUrlAllowWindow) => {
  queryTabsForHost(allow.host, (tabs) => {
    tabs.forEach((tab) => {
      const currentUrl = tab.url ?? tab.pendingUrl;
      if (normalizeTemporaryAllowUrl(currentUrl) !== allow.url) return;
      redirectTabToBlockPageIfNeeded(tab);
    });
  });
};

const normalizeTemporaryAllowUsageSession = (
  value: unknown
): TemporaryAllowUsageSession | null => {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<TemporaryAllowUsageSession>;
  const host = normalizeHost(typeof maybe.host === "string" ? maybe.host : null);
  if (!host) return null;
  if (typeof maybe.touchedAt !== "number" || !Number.isFinite(maybe.touchedAt)) {
    return null;
  }
  return { host, touchedAt: maybe.touchedAt };
};

const getActiveTemporaryAllowUsageSession =
  (): Promise<TemporaryAllowUsageSession | null> =>
    new Promise((resolve) => {
      if (activeTemporaryAllowUsageSessionLoaded) {
        resolve(activeTemporaryAllowUsageSession);
        return;
      }

      grayscaleStorageGet(
        { [STORAGE_KEYS.temporaryAllowUsageSession]: null },
        (items) => {
          activeTemporaryAllowUsageSession = normalizeTemporaryAllowUsageSession(
            items[STORAGE_KEYS.temporaryAllowUsageSession]
          );
          activeTemporaryAllowUsageSessionLoaded = true;
          resolve(activeTemporaryAllowUsageSession);
        }
      );
    });

const setActiveTemporaryAllowUsageSession = (
  session: TemporaryAllowUsageSession | null
): Promise<void> =>
  new Promise((resolve) => {
    activeTemporaryAllowUsageSession = session;
    activeTemporaryAllowUsageSessionLoaded = true;
    grayscaleStorageSet(
      { [STORAGE_KEYS.temporaryAllowUsageSession]: session },
      () => resolve()
    );
  });

const queueTemporaryAllowUsageSessionUpdate = <T>(
  task: () => Promise<T>
): Promise<T> => {
  const queued = temporaryAllowUsageSessionQueue.then(task, task);
  temporaryAllowUsageSessionQueue = queued.catch(() => undefined);
  return queued;
};

const recordTemporaryAllowUsedSeconds = (
  startedAt: number,
  host: string | null,
  endedAt = Date.now()
): Promise<DailyBlockerStats | null> => {
  const seconds = Math.floor((endedAt - startedAt) / 1000);
  if (seconds <= 0) return Promise.resolve(null);
  return updateDailyStats((stats) => withTemporaryAllowUsedSeconds(stats, seconds, host)).catch(
    (error) => {
      console.warn("temporary allow usage stats update failed", error);
      return null;
    }
  );
};

const setActiveTemporaryAllowUsageHostNow = async (
  host: string | null,
  now = Date.now()
): Promise<void> => {
  const previousSession = await getActiveTemporaryAllowUsageSession();
  if (previousSession?.host === host) {
    if (host && previousSession.touchedAt < now) {
      await setActiveTemporaryAllowUsageSession({ host, touchedAt: now });
      await recordTemporaryAllowUsedSeconds(previousSession.touchedAt, previousSession.host, now);
    }
    return;
  }

  await setActiveTemporaryAllowUsageSession(host ? { host, touchedAt: now } : null);
  if (previousSession) {
    await recordTemporaryAllowUsedSeconds(previousSession.touchedAt, previousSession.host, now);
  }
};

const setActiveTemporaryAllowUsageHost = (
  host: string | null,
  now = Date.now()
) => {
  void queueTemporaryAllowUsageSessionUpdate(() =>
    setActiveTemporaryAllowUsageHostNow(host, now)
  )
    .catch((error) => {
      console.warn("temporary allow usage session update failed", error);
    });
};

const refreshActiveTemporaryAllowUsageForUrl = (rawUrl?: string | null) => {
  if (!temporaryAllowStateLoaded) return;
  setActiveTemporaryAllowUsageHost(getTemporaryAllowedHostFromUrl(rawUrl));
};

const refreshActiveTemporaryAllowUsage = () => {
  if (!temporaryAllowStateLoaded) return;
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: ChromeTab[]) => {
    if (chrome.runtime.lastError) {
      console.warn("[tabs.query(active temporary allow usage)]", chrome.runtime.lastError.message);
      void stopActiveTemporaryAllowUsage();
      return;
    }
    const activeTab = tabs?.[0];
    refreshActiveTemporaryAllowUsageForUrl(activeTab?.url ?? activeTab?.pendingUrl);
  });
};

const stopActiveTemporaryAllowUsage = (endedAt = Date.now()) => {
  return queueTemporaryAllowUsageSessionUpdate(async () => {
    const previousSession = await getActiveTemporaryAllowUsageSession();
    await setActiveTemporaryAllowUsageSession(null);
    return previousSession
      ? recordTemporaryAllowUsedSeconds(previousSession.touchedAt, previousSession.host, endedAt)
      : null;
  })
    .catch((error) => {
      console.warn("temporary allow usage session stop failed", error);
      return null;
    });
};

const flushActiveTemporaryAllowUsage = (endedAt = Date.now()) => {
  return queueTemporaryAllowUsageSessionUpdate(async () => {
    const session = await getActiveTemporaryAllowUsageSession();
    if (!session) return null;
    await setActiveTemporaryAllowUsageSession({ ...session, touchedAt: endedAt });
    return recordTemporaryAllowUsedSeconds(session.touchedAt, session.host, endedAt);
  })
    .catch((error) => {
      console.warn("temporary allow usage session flush failed", error);
      return null;
    });
};

const stopActiveTemporaryAllowUsageForHost = (
  host: string | null,
  endedAt = Date.now()
) => {
  if (!host) return;
  void queueTemporaryAllowUsageSessionUpdate(async () => {
    const session = await getActiveTemporaryAllowUsageSession();
    if (session?.host === host) {
      await setActiveTemporaryAllowUsageSession(null);
      await recordTemporaryAllowUsedSeconds(session.touchedAt, session.host, endedAt);
    }
  })
    .catch((error) => {
      console.warn("temporary allow usage host stop failed", error);
    });
};

const formatElapsedBadgeText = (elapsedMinutes: number | null): string => {
  if (elapsedMinutes === null) return "";
  return elapsedMinutes < 1 ? "<1m" : `${elapsedMinutes}m`;
};

const formatElapsedTitleText = (elapsedMinutes: number | null): string | null => {
  if (elapsedMinutes === null) return null;
  if (elapsedMinutes < 1) return "< 1 minute";
  return `${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"}`;
};

const setTemporaryAllowBadge = (
  enabled: boolean,
  host?: string | null,
  rawUrl?: string | null
) => {
  if (!chrome.action?.setBadgeText || !chrome.action?.setTitle) return;
  if (enabled) {
    const window = getTemporaryAllowWindowForUrl(rawUrl) ?? (host ? getTemporaryAllowWindowForHost(host) : null);
    const elapsedMinutes = window
      ? Math.max(Math.floor((Date.now() - window.startedAt) / 60000), 0)
      : null;
    const elapsedTitleText = formatElapsedTitleText(elapsedMinutes);
    chrome.action.setBadgeText({
      text: formatElapsedBadgeText(elapsedMinutes),
    });
    chrome.action.setBadgeBackgroundColor?.({ color: TEMP_ALLOW_BADGE_COLOR });
    chrome.action.setTitle({
      title: host
        ? elapsedTitleText === null
          ? `NoDrift: temporary allow active for ${host}`
          : `NoDrift: temporary allow active for ${host} (${elapsedTitleText})`
        : "NoDrift: temporary allow active",
    });
    return;
  }

  chrome.action.setBadgeText({ text: "" });
  chrome.action.setTitle({ title: "NoDrift" });
};

const refreshBadgeForActiveTab = () => {
  if (!chrome.tabs?.query) return;
  pruneExpiredGrayscaleHosts();
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: ChromeTab[]) => {
    const activeTab = tabs?.[0];
    if (!activeTab) {
      setTemporaryAllowBadge(false);
      return;
    }

    const activeUrl = activeTab.url ?? activeTab.pendingUrl;
    const host = parseHostnameFromUrl(activeUrl);
    if (!host) {
      setTemporaryAllowBadge(false);
      return;
    }

    setTemporaryAllowBadge(
      isHostTemporarilyAllowed(host) || isUrlTemporarilyAllowed(activeUrl),
      host,
      activeUrl
    );
  });
};

const findRecentTemporaryAllowDecision = (
  stats: DailyBlockerStats,
  host: string | null,
  url: string | null
) => {
  if (!Array.isArray(stats.recentDecisions)) return null;
  return (
    stats.recentDecisions.find((decision) => {
      if (decision.action !== "temporary-allow") return false;
      if (url && decision.url === url) return true;
      return !!host && decision.site === host;
    }) ?? null
  );
};

const getActiveTemporaryAllowDetails = async (rawUrl?: string | null) => {
  pruneExpiredGrayscaleHosts();
  pruneExpiredTemporarilyAllowedUrls();
  const url = normalizeTemporaryAllowUrl(rawUrl);
  const host = parseHostnameFromUrl(url);
  if (!host) return { ok: true, active: false };

  const hostMatch = getTemporaryAllowMatchForHost(host);
  const urlMatch = getTemporaryAllowMatchForUrl(url);
  const activeWindow = hostMatch?.window ?? urlMatch;
  if (!activeWindow) return { ok: true, active: false };

  const stats = await getDailyStats();
  const decision = findRecentTemporaryAllowDecision(
    stats,
    hostMatch?.host ?? urlMatch?.host ?? host,
    urlMatch?.url ?? null
  );
  const now = Date.now();
  return {
    ok: true,
    active: true,
    scope: hostMatch ? "domain" : "url",
    host: hostMatch?.host ?? urlMatch?.host ?? host,
    url: urlMatch?.url ?? null,
    startedAt: activeWindow.startedAt,
    expiresAt: activeWindow.expiresAt,
    elapsedSeconds: Math.max(Math.floor((now - activeWindow.startedAt) / 1000), 0),
    remainingSeconds: Math.max(Math.floor((activeWindow.expiresAt - now) / 1000), 0),
    minutes: decision?.minutes ?? null,
    source: decision?.source ?? null,
    provider: decision?.provider ?? null,
    model: decision?.model ?? null,
    purpose: decision?.purpose ?? null,
    reason: decision?.message ?? null,
  };
};

const getAccessEffectSessionForUrl = (
  rawUrl?: string | null
): AccessEffectSession | null => {
  const host = parseHostnameFromUrl(rawUrl);
  if (!host) return null;

  const hostMatch = getTemporaryAllowMatchForHost(host);
  if (hostMatch) {
    return {
      source: hostMatch.window.source ?? null,
      scope: "domain",
      host: hostMatch.host,
      url: null,
      startedAt: hostMatch.window.startedAt,
      expiresAt: hostMatch.window.expiresAt,
    };
  }

  const urlMatch = getTemporaryAllowMatchForUrl(rawUrl);
  if (!urlMatch) return null;
  return {
    source: urlMatch.source ?? null,
    scope: "url",
    host: urlMatch.host,
    url: urlMatch.url,
    startedAt: urlMatch.startedAt,
    expiresAt: urlMatch.expiresAt,
  };
};

const getAccessEffectProgress = (
  session: AccessEffectSession,
  now = Date.now()
): number => {
  const duration = session.expiresAt - session.startedAt;
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.min(Math.max((now - session.startedAt) / duration, 0), 1);
};

const setAccessEffectStyleForTab = (
  tabId: number,
  css: string,
  overlayCss: string
) => {
  if (!chrome.scripting?.executeScript) return;
  chrome.scripting.executeScript(
    {
      target: { tabId, allFrames: true },
      args: [ACCESS_EFFECT_STYLE_ID, ACCESS_EFFECT_OVERLAY_ID, css, overlayCss],
      func: (
        styleId: string,
        overlayId: string,
        cssText: string,
        overlayCssText: string
      ) => {
        const existing = document.getElementById(styleId);
        if (!cssText.trim()) {
          existing?.remove();
        } else {
          const style =
            existing instanceof HTMLStyleElement
              ? existing
              : document.createElement("style");
          style.id = styleId;
          style.textContent = cssText;
          if (!style.parentElement) {
            (document.head || document.documentElement).appendChild(style);
          }
        }

        const existingOverlay = document.getElementById(overlayId);
        if (!overlayCssText.trim()) {
          existingOverlay?.remove();
          return;
        }

        const overlay = existingOverlay ?? document.createElement("div");
        overlay.id = overlayId;
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.cssText = overlayCssText;
        if (!overlay.parentElement) {
          (document.body || document.documentElement).appendChild(overlay);
        }
      },
    },
    withLastErrorLog("executeScript(access effects)")
  );
};

const syncAccessEffectsForUrl = (tabId: number, rawUrl?: string | null) => {
  const session = getAccessEffectSessionForUrl(rawUrl);
  if (!session || selectedAccessEffectIds.length === 0) {
    setAccessEffectStyleForTab(tabId, "", "");
    return;
  }

  const now = Date.now();
  const context = {
    session,
    now,
    progress: getAccessEffectProgress(session, now),
  };
  const css = buildAccessEffectCss(selectedAccessEffectIds, context);
  const overlayCss = buildAccessEffectOverlayCss(selectedAccessEffectIds, context);
  setAccessEffectStyleForTab(tabId, css, overlayCss);
};

const syncAccessEffectsForHostTabs = (host: string) => {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ url: [`*://${host}/*`, `*://*.${host}/*`] }, (tabs: ChromeTab[]) => {
    if (chrome.runtime.lastError) {
      console.warn("[tabs.query(sync access effects)]", chrome.runtime.lastError.message);
      return;
    }
    tabs.forEach((tab: ChromeTab) => {
      if (typeof tab.id === "number") {
        syncAccessEffectsForUrl(tab.id, tab.url);
      }
    });
  });
};

const removeAccessEffectsFromAllTabs = () => {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({}, (tabs: ChromeTab[]) => {
    tabs.forEach((tab: ChromeTab) => {
      if (typeof tab.id !== "number") return;
      setAccessEffectStyleForTab(tab.id, "", "");
    });
  });
};

const getActiveAccessEffectSessions = (): AccessEffectSession[] => {
  const now = Date.now();
  const sessions: AccessEffectSession[] = [];
  grayscaleHosts.forEach((window, host) => {
    if (window.expiresAt <= now) return;
    sessions.push({
      source: window.source ?? null,
      scope: "domain",
      host,
      url: null,
      startedAt: window.startedAt,
      expiresAt: window.expiresAt,
    });
  });
  temporarilyAllowedUrls.forEach((allow) => {
    if (allow.expiresAt <= now) return;
    sessions.push({
      source: allow.source ?? null,
      scope: "url",
      host: allow.host,
      url: allow.url,
      startedAt: allow.startedAt,
      expiresAt: allow.expiresAt,
    });
  });
  return sessions;
};

const syncActiveAccessEffectTabs = () => {
  if (selectedAccessEffectIds.length === 0) {
    removeAccessEffectsFromAllTabs();
    return;
  }

  const hosts = new Set<string>();
  getActiveAccessEffectSessions().forEach((session) => hosts.add(session.host));
  if (hosts.size === 0) {
    removeAccessEffectsFromAllTabs();
    return;
  }
  hosts.forEach((host) => syncAccessEffectsForHostTabs(host));
};

const getNextAccessEffectRefreshAt = (): number | null => {
  if (selectedAccessEffectIds.length === 0) return null;
  const milestones = getAccessEffectMilestones(selectedAccessEffectIds).filter(
    (milestone) => milestone > 0 && milestone < 100
  );
  if (milestones.length === 0) return null;

  const now = Date.now();
  let nextAt: number | null = null;
  for (const session of getActiveAccessEffectSessions()) {
    const duration = session.expiresAt - session.startedAt;
    if (!Number.isFinite(duration) || duration <= 0) continue;
    for (const milestone of milestones) {
      const thresholdAt = session.startedAt + duration * (milestone / 100);
      if (thresholdAt <= now + 500) continue;
      if (nextAt === null || thresholdAt < nextAt) nextAt = thresholdAt;
    }
  }
  return nextAt;
};

const scheduleAccessEffectsRefreshAlarm = () => {
  if (!chrome.alarms?.clear || !chrome.alarms?.create) return;
  chrome.alarms.clear(ALARM_NAMES.accessEffectsRefresh, () => {
    const nextAt = getNextAccessEffectRefreshAt();
    if (nextAt === null) return;
    chrome.alarms.create(ALARM_NAMES.accessEffectsRefresh, {
      when: Math.max(nextAt, Date.now() + 1000),
    });
  });
};

const pruneExpiredGrayscaleHosts = () => {
  const now = Date.now();
  let changed = false;
  for (const [host, window] of grayscaleHosts.entries()) {
    if (!Number.isFinite(window.expiresAt) || window.expiresAt <= now) {
      grayscaleHosts.delete(host);
      stopActiveTemporaryAllowUsageForHost(
        host,
        Number.isFinite(window.expiresAt) ? window.expiresAt : now
      );
      syncAccessEffectsForHostTabs(host);
      changed = true;
    }
  }
  if (changed) {
    persistGrayscaleHosts();
    refreshBadgeForActiveTab();
    refreshRulesIfReady();
    scheduleAccessEffectsRefreshAlarm();
  }
};

const getNextTemporaryUrlAllowRuleId = (): number => {
  let nextId = TEMP_URL_ALLOW_RULE_ID_BASE;
  while (temporarilyAllowedUrls.has(nextId) || nextId <= blockedSites.length) {
    nextId += 1;
  }
  return nextId;
};

const pruneExpiredTemporarilyAllowedUrls = () => {
  const now = Date.now();
  let changed = false;
  const hostsToSync = new Set<string>();
  for (const [id, allow] of temporarilyAllowedUrls.entries()) {
    if (allow.expiresAt > now) continue;
    temporarilyAllowedUrls.delete(id);
    hostsToSync.add(allow.host);
    chrome.alarms.clear(`restore-url-${id}`);
    changed = true;
  }
  if (changed) {
    persistTemporarilyAllowedUrls();
    hostsToSync.forEach((host) => syncAccessEffectsForHostTabs(host));
    refreshBadgeForActiveTab();
    refreshActiveTemporaryAllowUsage();
    scheduleAccessEffectsRefreshAlarm();
  }
  return changed;
};

const scheduleGrayscaleForHosts = (
  hosts: string[],
  minutes: number,
  source: string | null = null
) => {
  if (hosts.length === 0) return;
  pruneExpiredGrayscaleHosts();
  const normalizedMinutes = Number.isFinite(minutes) ? Math.max(minutes, 1) : 1;
  const durationMs = normalizedMinutes * 60 * 1000;
  const startedAt = Date.now();
  const expiresAt = startedAt + durationMs;
  let changed = false;
  for (const rawHost of hosts) {
    const host = normalizeHost(rawHost);
    if (!host) continue;
    const existing = grayscaleHosts.get(host);
    if (!existing || existing.expiresAt < expiresAt) {
      grayscaleHosts.set(host, { expiresAt, startedAt, source });
      changed = true;
    }
    syncAccessEffectsForHostTabs(host);
  }
  if (changed) {
    persistGrayscaleHosts();
    refreshBadgeForActiveTab();
    scheduleAccessEffectsRefreshAlarm();
  }
};

const scheduleTemporaryUrlAllow = (
  rawUrl: string,
  host: string,
  minutes: number,
  source: string | null = null
): boolean => {
  const url = normalizeTemporaryAllowUrl(rawUrl);
  if (!url) return false;
  pruneExpiredTemporarilyAllowedUrls();
  const normalizedMinutes = Number.isFinite(minutes) ? Math.max(minutes, 1) : 1;
  const durationMs = normalizedMinutes * 60 * 1000;
  const startedAt = Date.now();
  const expiresAt = startedAt + durationMs;
  const existing = Array.from(temporarilyAllowedUrls.values()).find(
    (allow) => allow.url === url
  );
  const id = existing?.id ?? getNextTemporaryUrlAllowRuleId();
  const previous = existing ?? null;
  temporarilyAllowedUrls.set(id, {
    id,
    url,
    host,
    startedAt: previous ? previous.startedAt : startedAt,
    expiresAt,
    source,
  });
  persistTemporarilyAllowedUrls();
  refreshRulesIfReady();
  refreshBadgeForActiveTab();
  scheduleBadgeRefreshAlarm();
  chrome.alarms.create(`restore-url-${id}`, { delayInMinutes: normalizedMinutes });
  syncAccessEffectsForHostTabs(host);
  scheduleAccessEffectsRefreshAlarm();
  return true;
};

const clearGrayscaleHosts = () => {
  const hadHosts = grayscaleHosts.size > 0;
  void stopActiveTemporaryAllowUsage();
  grayscaleHosts.clear();
  if (hadHosts) {
    persistGrayscaleHosts();
  } else {
    grayscaleStorageSet({ [STORAGE_KEYS.temporarilyAllowedGrayscaleHosts]: [] });
  }
  removeAccessEffectsFromAllTabs();
  refreshBadgeForActiveTab();
  refreshRulesIfReady();
  scheduleAccessEffectsRefreshAlarm();
};

const clearTemporaryUrlAllows = () => {
  if (temporarilyAllowedUrls.size === 0) {
    grayscaleStorageSet({ [STORAGE_KEYS.temporarilyAllowedUrls]: [] });
    return;
  }
  temporarilyAllowedUrls.forEach((allow) => {
    chrome.alarms.clear(`restore-url-${allow.id}`);
  });
  temporarilyAllowedUrls.clear();
  persistTemporarilyAllowedUrls();
  refreshRulesIfReady();
  refreshBadgeForActiveTab();
  syncActiveAccessEffectTabs();
  scheduleAccessEffectsRefreshAlarm();
};

const loadAccessEffectSettings = () => {
  chrome.storage.sync.get(
    {
      [STORAGE_KEYS.accessEffectIds]: null,
      [STORAGE_KEYS.grayscaleOnTemporaryAllow]: DEFAULT_GRAYSCALE_ON_TEMP_ALLOW,
    },
    (data: StorageItems) => {
      selectedAccessEffectIds = normalizeAccessEffectIds(
        data[STORAGE_KEYS.accessEffectIds],
        data[STORAGE_KEYS.grayscaleOnTemporaryAllow] === false
          ? []
          : DEFAULT_ACCESS_EFFECT_IDS
      );
      syncActiveAccessEffectTabs();
      scheduleAccessEffectsRefreshAlarm();
      refreshBadgeForActiveTab();
    }
  );
};

const loadGrayscaleHosts = () => {
  grayscaleStorageGet(
    {
      [STORAGE_KEYS.temporarilyAllowedGrayscaleHosts]: [],
      [STORAGE_KEYS.temporarilyAllowedUrls]: [],
    },
    (items) => {
      const rawEntries = Array.isArray(
        items?.[STORAGE_KEYS.temporarilyAllowedGrayscaleHosts]
      )
        ? (items[STORAGE_KEYS.temporarilyAllowedGrayscaleHosts] as unknown[])
        : [];
      const rawUrlEntries = Array.isArray(items?.[STORAGE_KEYS.temporarilyAllowedUrls])
        ? (items[STORAGE_KEYS.temporarilyAllowedUrls] as unknown[])
        : [];
      grayscaleHosts.clear();
      temporarilyAllowedUrls.clear();
      const now = Date.now();
      let changed = false;
      for (const entry of rawEntries) {
        if (
          !Array.isArray(entry) ||
          (entry.length !== 2 && entry.length !== 3 && entry.length !== 4)
        ) {
          changed = true;
          continue;
        }
        const [rawHost, rawExpiresAt, rawStartedAt, rawSource] = entry as [
          unknown,
          unknown,
          unknown?,
          unknown?
        ];
        const host = normalizeHost(typeof rawHost === "string" ? rawHost : null);
        if (!host || typeof rawExpiresAt !== "number") {
          changed = true;
          continue;
        }
        const expiresAt = rawExpiresAt;
        const startedAt =
          typeof rawStartedAt === "number" && Number.isFinite(rawStartedAt)
            ? rawStartedAt
            : expiresAt;
        if (expiresAt > now) {
          grayscaleHosts.set(host, {
            expiresAt,
            startedAt,
            source: typeof rawSource === "string" ? rawSource : null,
          });
          if (entry.length !== 4) changed = true;
        } else {
          changed = true;
        }
      }
      for (const entry of rawUrlEntries) {
        const normalized = normalizeTemporaryUrlAllowEntry(entry);
        if (!normalized) {
          changed = true;
          continue;
        }
        if (normalized.expiresAt <= now) {
          changed = true;
          continue;
        }
        temporarilyAllowedUrls.set(normalized.id, normalized);
      }
      if (changed) {
        persistGrayscaleHosts();
        persistTemporarilyAllowedUrls();
      }
      temporaryAllowStateLoaded = true;
      refreshBadgeForActiveTab();
      refreshActiveTemporaryAllowUsage();
      refreshRulesIfReady();
      syncActiveAccessEffectTabs();
      scheduleAccessEffectsRefreshAlarm();
    }
  );
};

const refreshRules = (next?: () => void) => {
  pruneExpiredTemporarilyAllowedUrls();
  chrome.declarativeNetRequest.getDynamicRules((rules: DynamicRule[]) => {
    const ids = rules.map((r: DynamicRule) => r.id);
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: ids, addRules: buildRulesForCurrentState() },
      withLastErrorLog("refreshRules", next)
    );
  });
};

const refreshRulesIfReady = (next?: () => void) => {
  if (!blockedSitesLoaded || !temporaryAllowStateLoaded) return false;
  refreshRules(next);
  return true;
};

const loadBlockedSites = () => {
  chrome.storage.sync.get({ [STORAGE_KEYS.blockedSites]: DEFAULT_BLOCKED_SITES }, (data: StorageItems) => {
    blockedSites = data[STORAGE_KEYS.blockedSites];
    blockedSitesLoaded = true;

    chrome.storage.local.get({ [STORAGE_KEYS.cachedBlockedSites]: null }, (cache: StorageItems) => {
      const cached = cache[STORAGE_KEYS.cachedBlockedSites];
      const changed =
        !cached || JSON.stringify(cached) !== JSON.stringify(blockedSites);
      if (changed) {
        chrome.storage.local.set({ [STORAGE_KEYS.cachedBlockedSites]: blockedSites });
      }
      refreshRulesIfReady();
    });
  });
};

loadBlockedSites();
getTempAllowMinutes();
loadAccessEffectSettings();
loadGrayscaleHosts();
refreshBadgeForActiveTab();
scheduleBadgeRefreshAlarm();

if (chrome.permissions?.onAdded) {
  chrome.permissions.onAdded.addListener((permissions: { origins?: string[] }) => {
    if (permissions.origins?.length) {
      refreshRulesIfReady();
    }
  });
}

chrome.storage.onChanged.addListener((changes: StorageChanges, area: string) => {
  if (area === "sync") {
    if (changes[STORAGE_KEYS.blockedSites]) {
      blockedSites = changes[STORAGE_KEYS.blockedSites].newValue;
      blockedSitesLoaded = true;
      refreshRules();
      chrome.storage.local.set({ [STORAGE_KEYS.cachedBlockedSites]: blockedSites });
    }
    if (changes[STORAGE_KEYS.tempAllowMinutes]) {
      tempAllowMinutes = changes[STORAGE_KEYS.tempAllowMinutes].newValue;
    }
    if (changes[STORAGE_KEYS.accessEffectIds]) {
      selectedAccessEffectIds = normalizeAccessEffectIds(
        changes[STORAGE_KEYS.accessEffectIds].newValue
      );
      syncActiveAccessEffectTabs();
      scheduleAccessEffectsRefreshAlarm();
      refreshBadgeForActiveTab();
    } else if (changes[STORAGE_KEYS.grayscaleOnTemporaryAllow]) {
      selectedAccessEffectIds =
        changes[STORAGE_KEYS.grayscaleOnTemporaryAllow].newValue === false
          ? []
          : [...DEFAULT_ACCESS_EFFECT_IDS];
      syncActiveAccessEffectTabs();
      scheduleAccessEffectsRefreshAlarm();
      refreshBadgeForActiveTab();
    }
  }
});

// Temporarily allow one or more rules (removes rules & sets timers to restore).
const allowRulesTemporarily = async (
  ids: number[],
  minutes: number,
  source: string | null = null
): Promise<boolean> => {
  if (ids.length === 0) return false;
  const hostsForIds = ids
    .map((id) => blockedSites[id - 1])
    .filter((host): host is string => typeof host === "string" && !!host);
  await updateDynamicRulesAsync({ removeRuleIds: ids });
  scheduleGrayscaleForHosts(hostsForIds, minutes, source);
  scheduleBadgeRefreshAlarm();
  ids.forEach((id) =>
    chrome.alarms.create(`restore-${id}`, { delayInMinutes: minutes })
  );
  return true;
};

type TemporaryAllowResult = {
  ok: boolean;
  host: string | null;
  url: string | null;
  scope: "domain" | "url" | "none";
  minutes: number;
  provider?: string | null;
  model?: string | null;
};

type TemporaryAllowWaitingResult = {
  ok: false;
  waiting: true;
  allowCountToday: number;
  delaySeconds: number;
  remainingSeconds: number;
  readyAt: number;
};

const getIncreasingAllowDelayEnabled = (): Promise<boolean> =>
  getSyncStorageItems({
    [STORAGE_KEYS.increasingAllowDelayEnabled]:
      DEFAULT_INCREASING_ALLOW_DELAY_ENABLED,
  }).then(
    (items) => items[STORAGE_KEYS.increasingAllowDelayEnabled] === true
  );

const getPendingTemporaryAllowDelay =
  async (): Promise<PendingTemporaryAllowDelay | null> => {
    const items = await getLocalStorageItems({
      [STORAGE_KEYS.pendingTemporaryAllowDelay]: null,
    });
    return normalizePendingTemporaryAllowDelay(
      items[STORAGE_KEYS.pendingTemporaryAllowDelay]
    );
  };

const setPendingTemporaryAllowDelay = (
  pending: PendingTemporaryAllowDelay | null
): Promise<void> =>
  new Promise((resolve) => {
    chrome.storage.local.set(
      { [STORAGE_KEYS.pendingTemporaryAllowDelay]: pending },
      () => resolve()
    );
  });

const queueTemporaryAllowRequest = <T>(task: () => Promise<T>): Promise<T> => {
  const queued = temporaryAllowRequestQueue.then(task, task);
  temporaryAllowRequestQueue = queued.catch(() => undefined);
  return queued;
};

const applyTemporaryAllowDecision = async (
  decision: AccessGateDecision,
  source: string | null = null
): Promise<TemporaryAllowResult> => {
  const application = buildDecisionApplication(decision);
  if (application.operation === "allow-url") {
    const ok = scheduleTemporaryUrlAllow(
      application.url,
      application.host,
      application.minutes,
      source
    );
    return {
      ok,
      host: ok ? application.host : null,
      url: ok ? application.url : null,
      scope: "url",
      minutes: application.minutes,
    };
  }

  if (application.operation === "allow-domain") {
    const ok = await allowRulesTemporarily(
      application.ruleIds,
      application.minutes,
      source
    );
    return {
      ok,
      host: ok ? application.host : null,
      url: null,
      scope: "domain",
      minutes: application.minutes,
    };
  }

  return {
    ok: false,
    host: null,
    url: null,
    scope: "none",
    minutes: application.minutes,
  };
};

const temporarilyAllowFromUrl = async (
  payload: TemporarilyAllowTabMessage,
  sender?: any
): Promise<TemporaryAllowResult | TemporaryAllowWaitingResult> => {
  const defaultMinutes = await getTempAllowMinutes();
  const requestedScope = payload.scope === "url" ? "url" : "domain";
  const requestedUrl =
    requestedScope === "url"
      ? await getTemporarilyAllowedDestination(payload, sender, {
          getLedgerUrl: getLastNavigatedUrlForTab,
          getTabNavigatedHttpUrl,
        })
      : null;
  const decision = temporaryAllowGate.decide({
    rawUrl: payload.url,
    requestedScope,
    requestedUrl,
    blockedSites,
    defaultMinutes,
  });
  const application = buildDecisionApplication(decision);
  if (application.operation === "none") {
    return applyTemporaryAllowDecision(decision, "temporary-allow");
  }

  const [delayEnabled, stats, pending] = await Promise.all([
    getIncreasingAllowDelayEnabled(),
    getDailyStats(),
    getPendingTemporaryAllowDelay(),
  ]);
  const delay = evaluateTemporaryAllowDelay({
    enabled: delayEnabled,
    successfulAllowsToday: stats.temporaryAllowsToday,
    dayKey: stats.dayKey,
    targetKey: buildTemporaryAllowDelayTargetKey({
      scope: application.scope,
      host: application.host,
      url: application.operation === "allow-url" ? application.url : null,
    }),
    pending,
  });

  if (delay.status === "waiting") {
    await setPendingTemporaryAllowDelay(delay.pending);
    setTemporaryAllowContextMenuTitle(
      `Wait ${delay.remainingSeconds}s, then choose again`
    );
    return {
      ok: false,
      waiting: true,
      allowCountToday: delay.allowCountToday,
      delaySeconds: delay.delaySeconds,
      remainingSeconds: delay.remainingSeconds,
      readyAt: delay.readyAt,
    };
  }

  const allowResult = await applyTemporaryAllowDecision(
    decision,
    "temporary-allow"
  );
  if (allowResult.ok || !delayEnabled) {
    await setPendingTemporaryAllowDelay(null);
    setTemporaryAllowContextMenuTitle(TEMPORARILY_ALLOW_CONTEXT_MENU_TITLE);
  }
  return allowResult;
};

const getRequestUrlContext = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any
): Promise<{ currentUrl: string | null; currentSite: string | null }> => {
  const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
  const fallbackCurrentUrl =
    tabId !== null ? getLastNavigatedUrlForTab(tabId) || (await getTabNavigatedHttpUrl(tabId)) : null;
  return {
    currentUrl: ensureHttpUrl(payload.currentUrl) || fallbackCurrentUrl,
    currentSite: sanitizeSite(payload.currentSite) || sanitizeSite(parseSiteFromSender(sender)),
  };
};

const buildRequestGateInput = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any
): Promise<RequestGateInput> => {
  const defaultMinutes = await getTempAllowMinutes();
  const { currentUrl, currentSite } = await getRequestUrlContext(payload, sender);
  const stats = await getDailyStats();
  return {
    rawUrl: payload.url,
    requestedUrl: currentUrl,
    currentSite,
    blockedSites,
    defaultMinutes,
    requestedText: typeof payload.purpose === "string" ? payload.purpose : "",
    requestedMinutes: Number(payload.requestedMinutes) || defaultMinutes,
    followUpAnswer: payload.followUpAnswer,
    followUpCount: Number(payload.followUpCount) || 0,
    challengeId: payload.challengeId,
    stats: buildAccessGateStatsContext(stats, currentSite),
  };
};

const applyRequestGateDecision = async (
  result: RequestGateDecisionResult,
  source: string
): Promise<TemporaryAllowResult & RequestGateDecisionResult> => {
  const allowResult = await applyTemporaryAllowDecision(result.decision, source);
  return { ...allowResult, ...result };
};

const requestIfThenIntentionAccess = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any
): Promise<TemporaryAllowResult & RequestGateDecisionResult> => {
  const input = await buildRequestGateInput(payload, sender);
  return applyRequestGateDecision(decideIfThenIntentionRequest(input), "if-then-intention");
};

const requestBuiltGateAccess = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any
): Promise<TemporaryAllowResult & RequestGateDecisionResult> => {
  const input = await buildRequestGateInput(payload, sender);
  const result = await decideBuiltGateRequest(input);
  return applyRequestGateDecision(result, "built-gate");
};

const requestGithubContributionAccess = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any
): Promise<TemporaryAllowResult & RequestGateDecisionResult> => {
  const input = await buildRequestGateInput(payload, sender);
  const result = await decideGithubContributionRequest(input);
  return applyRequestGateDecision(result, "github-contribution");
};

const requestAiStudyQuizAccess = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any
): Promise<TemporaryAllowResult & RequestGateDecisionResult> => {
  const input = await buildRequestGateInput(payload, sender);
  const result = await decideAiStudyQuizRequest(input);
  return applyRequestGateDecision(result, "ai-study-quiz");
};

const requestLlmReviewedAccess = async (
  payload: RequestLocalIntentAccessMessage,
  sender?: any,
  onProgress?: (stage: AccessReviewProgressStage) => void
): Promise<TemporaryAllowResult & RequestGateDecisionResult> => {
  const input = await buildRequestGateInput(payload, sender);
  const result = await decideLlmReviewedRequest(input, onProgress);
  return applyRequestGateDecision(result, "llm-reviewed");
};

// Re-add a specific rule immediately and refresh the current tab so it takes effect.
const restoreNowById = (id: number, tabId?: number, currentUrl?: string) => {
  chrome.alarms.clear(`restore-${id}`);
  const site = blockedSites[id - 1];
  if (!site) return;
  const normalizedHost = normalizeHost(site);
  stopActiveTemporaryAllowUsageForHost(normalizedHost);
  if (normalizedHost && grayscaleHosts.has(normalizedHost)) {
    grayscaleHosts.delete(normalizedHost);
    persistGrayscaleHosts();
    syncAccessEffectsForHostTabs(normalizedHost);
    scheduleAccessEffectsRefreshAlarm();
    refreshBadgeForActiveTab();
  }

  chrome.declarativeNetRequest.updateDynamicRules(
    { addRules: [buildRule(site, id)] },
    withLastErrorLog("addRules(re-add one)", () => {
      if (!tabId) return;
      // If we were on the allowed site, navigate to it again to trigger the block;
      // if we're on the block page already, just reload.
      const isExtensionUrl = isExtensionPageUrl(currentUrl);

      if (currentUrl && !isExtensionUrl) {
        chrome.tabs.update(tabId, { url: currentUrl });
      } else {
        chrome.tabs.reload(tabId);
      }
    })
  );
};

// NEW: Re-block ALL sites — clears alarms, clears session storage, and atomically resets every rule.
const reblockAllNow = (tabId?: number, currentUrl?: string) => {
  clearGrayscaleHosts();
  clearTemporaryUrlAllows();
  chrome.alarms.clearAll(
    withLastErrorLog("alarms.clearAll", () => {
      scheduleBadgeRefreshAlarm();
      // Best-effort: clear any session storage keys we may have used.
      if (chrome.storage?.session?.clear) {
        chrome.storage.session.clear(
          withLastErrorLog("storage.session.clear", () => resetAllRulesAndReload(tabId, currentUrl))
        );
      } else {
        resetAllRulesAndReload(tabId, currentUrl);
      }
    })
  );
};

const resetAllRulesAndReload = (tabId?: number, currentUrl?: string) => {
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: allRuleIds(),
      addRules: buildRules(blockedSites),
    },
    withLastErrorLog("updateDynamicRules(reset all)", () => {
      // Optional: log the current dynamic rules for debugging.
      chrome.declarativeNetRequest.getDynamicRules((rules: DynamicRule[]) => {
        console.log("Dynamic rules after reset:", rules.map((r: DynamicRule) => r.id));
      });

      if (!tabId || !currentUrl) return;

      const isExtensionUrl = isExtensionPageUrl(currentUrl);

      // Force a top-level navigation so DNR re-evaluates and blocks.
      if (isExtensionUrl) {
        chrome.tabs.reload(tabId);
      } else {
        chrome.tabs.update(tabId, { url: currentUrl });
      }
    })
  );
};

// ---------- Peek with ChatGPT integration ----------

type PeekInjectionStatus = "sent" | "filled" | "clipboard" | "error" | "unknown";

type PeekWithChatGPTMessage = {
  type: "peek-with-chatgpt";
  site?: string | null;
  originalUrl?: string | null;
};

type TemporarilyAllowTabMessage = {
  type: "temporarily-allow-tab";
  url?: string | null;
  tabId?: number | null;
  scope?: "domain" | "url";
};

type RecordBlockedAttemptMessage = {
  type: "record-blocked-attempt";
  site?: string | null;
  rid?: number | null;
};

type RequestLocalIntentAccessMessage = {
  type:
    | "request-llm-reviewed-access"
    | "request-if-then-intention-access"
    | "request-built-gate-access"
    | "request-github-contribution-access"
    | "request-ai-study-quiz-access";
  url?: string | null;
  currentUrl?: string | null;
  currentSite?: string | null;
  purpose?: string | null;
  requestedMinutes?: number | null;
  followUpAnswer?: string | null;
  followUpCount?: number | null;
  challengeId?: string | null;
};

const TEMPORARY_ALLOW_MESSAGE_TYPE =
  BLOCK_PAGE_ACTION_CAPABILITIES.find((capability) => capability.type === "temporary-allow")
    ?.messageType ?? "temporarily-allow-tab";

const CHATGPT_PEEK_MESSAGE_TYPE =
  OPTIONAL_INTEGRATIONS.find((integration) => integration.id === "chatgpt-peek")
    ?.messageType ?? "peek-with-chatgpt";


const REQUEST_LLM_REVIEWED_ACCESS_MESSAGE_TYPE =
  BLOCK_PAGE_ACTION_CAPABILITIES.find((capability) => capability.id === "llm-reviewed-request-access")
    ?.messageType ?? "request-llm-reviewed-access";
const REQUEST_IF_THEN_INTENTION_ACCESS_MESSAGE_TYPE =
  BLOCK_PAGE_ACTION_CAPABILITIES.find((capability) => capability.id === "if-then-intention-request-access")
    ?.messageType ?? "request-if-then-intention-access";
const REQUEST_BUILT_GATE_ACCESS_MESSAGE_TYPE =
  BLOCK_PAGE_ACTION_CAPABILITIES.find((capability) => capability.id === BUILT_GATE_ACCESS_GATE_ACTION_ID)
    ?.messageType ?? "request-built-gate-access";
const REQUEST_GITHUB_CONTRIBUTION_ACCESS_MESSAGE_TYPE =
  BLOCK_PAGE_ACTION_CAPABILITIES.find((capability) => capability.id === "github-contribution-request-access")
    ?.messageType ?? "request-github-contribution-access";
const REQUEST_AI_STUDY_QUIZ_ACCESS_MESSAGE_TYPE =
  BLOCK_PAGE_ACTION_CAPABILITIES.find((capability) => capability.id === "ai-study-quiz-request-access")
    ?.messageType ?? "request-ai-study-quiz-access";
const ACCESS_REVIEW_PROGRESS_PORT = "access-review-progress";

const stripTags = (value: string): string =>
  value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

type SnapshotItem = { title: string; url?: string };

const uniq = <T, K extends string | number>(arr: T[], by: (item: T) => K): T[] => {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of arr) {
    const key = by(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const absolutize = (href: string, base: string): string => {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
};

const NAV_WORDS = new Set([
  "home",
  "sections",
  "top stories",
  "newsletters",
  "podcasts",
  "live",
  "opinion",
  "subscribe",
  "sign in",
  "account",
  "help",
  "about",
  "menu",
  "search",
  "latest",
  "trending",
  "more",
  "privacy",
  "terms",
  "contact",
]);

const extractFromJSONLD = (html: string, baseUrl: string): SnapshotItem[] => {
  const results: SnapshotItem[] = [];
  const rx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    const candidates: any[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        candidates.push(...parsed);
      } else {
        candidates.push(parsed);
      }
    } catch {
      continue;
    }

    const pushArticle = (node: any) => {
      if (!node) return;
      const headline = node?.headline || node?.name || node?.title;
      const url = node?.url || node?.mainEntityOfPage?.["@id"] || node?.mainEntityOfPage;
      if (headline && typeof headline === "string") {
        results.push({
          title: headline.trim(),
          url: url ? absolutize(url, baseUrl) : undefined,
        });
      }
    };

    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      const type = Array.isArray(node["@type"]) ? node["@type"][0] : node["@type"];

      if (type === "ItemList" && Array.isArray(node.itemListElement)) {
        for (const element of node.itemListElement) {
          const item = element?.item || element;
          if (item) pushArticle(item);
        }
      } else if (
        type === "NewsArticle" ||
        type === "Article" ||
        type === "CreativeWork"
      ) {
        pushArticle(node);
      } else if (node["@graph"]) {
        for (const graphNode of node["@graph"]) {
          walk(graphNode);
        }
      }
    };

    for (const candidate of candidates) {
      walk(candidate);
    }
  }

  return uniq(results, (item) => `${item.title}|${item.url || ""}`).slice(0, 12);
};

const discoverFeeds = (html: string, baseUrl: string): string[] => {
  const feeds: string[] = [];
  const rx = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(html))) {
    const tag = match[0];
    const type = (tag.match(/type=["']([^"']+)["']/i)?.[1] || "").toLowerCase();
    if (!/rss|atom|rdf\+xml|application\/xml/.test(type)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) feeds.push(absolutize(href, baseUrl));
  }

  return uniq(feeds, (feed) => feed);
};

const parseRSSItems = (xml: string): SnapshotItem[] => {
  const items: SnapshotItem[] = [];

  const itemRx = /<item>[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRx.exec(xml))) {
    const block = match[0];
    const title =
      (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || "").trim();
    const link =
      (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ||
        block.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*\/?/i)?.[1] ||
        "").trim();
    if (title && !NAV_WORDS.has(title.toLowerCase())) {
      items.push({ title: stripTags(title), url: link || undefined });
    }
  }

  if (items.length === 0) {
    const entryRx = /<entry>[\s\S]*?<\/entry>/gi;
    while ((match = entryRx.exec(xml))) {
      const block = match[0];
      const title =
        (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || "").trim();
      const link = (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "").trim();
      if (title && !NAV_WORDS.has(title.toLowerCase())) {
        items.push({ title: stripTags(title), url: link || undefined });
      }
    }
  }

  return uniq(items, (item) => `${item.title}|${item.url || ""}`).slice(0, 12);
};

const discoverAmp = (html: string, baseUrl: string): string[] => {
  const candidates: string[] = [];

  const link = html.match(/<link[^>]+rel=["']amphtml["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (link) {
    candidates.push(absolutize(link, baseUrl));
  }

  try {
    const parsed = new URL(baseUrl);
    const ampCandidates = [
      baseUrl.includes("?") ? `${baseUrl}&amp=1` : `${baseUrl}?amp=1`,
      baseUrl.includes("?")
        ? `${baseUrl}&outputType=amp`
        : `${baseUrl}?outputType=amp`,
      `${parsed.origin}${parsed.pathname.replace(/\/?$/, "/amp")}${parsed.search || ""}`,
    ];
    candidates.push(...ampCandidates);
  } catch {
    // ignore URL parsing issues
  }

  return uniq(candidates, (candidate) => candidate);
};

const extractAnchorsFromMain = (html: string): SnapshotItem[] => {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const chunk = mainMatch ? mainMatch[1] : html;

  const items: SnapshotItem[] = [];
  const anchorRx = /<a\s+[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRx.exec(chunk))) {
    const raw = stripTags(match[1]).replace(/\s+/g, " ").trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (NAV_WORDS.has(lower)) continue;
    if (raw.length < 25 || raw.length > 160) continue;
    items.push({ title: raw });
  }

  return uniq(items, (item) => item.title.toLowerCase()).slice(0, 12);
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    redirect: "follow",
    credentials: "omit",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    referrerPolicy: "no-referrer",
  });
  return response.text();
};

const fetchSnapshot = async (url: string): Promise<string> => {
  const baseUrl = url;
  let html = "";

  try {
    html = await fetchText(url);
  } catch (error) {
    console.warn("Failed to fetch HTML for snapshot", error);
  }

  let items: SnapshotItem[] = [];

  if (html) {
    items = extractFromJSONLD(html, baseUrl);
  }

  if (items.length < 3 && html) {
    const feeds = discoverFeeds(html, baseUrl);
    if (feeds.length) {
      try {
        const xml = await fetchText(feeds[0]);
        const rssItems = parseRSSItems(xml);
        if (rssItems.length) {
          items = rssItems;
        }
      } catch (error) {
        console.warn("Failed to fetch RSS feed for snapshot", error);
      }
    }
  }

  if (items.length < 3 && html) {
    const ampCandidates = discoverAmp(html, baseUrl);
    for (const ampUrl of ampCandidates) {
      try {
        const ampHtml = await fetchText(ampUrl);
        const ampItems = extractFromJSONLD(ampHtml, ampUrl);
        items = ampItems.length >= 3 ? ampItems : extractAnchorsFromMain(ampHtml);
        if (items.length) {
          break;
        }
      } catch (error) {
        console.warn("Failed to fetch AMP page for snapshot", error);
      }
    }
  }

  if (items.length < 3 && html) {
    items = extractAnchorsFromMain(html);
  }

  if (items.length === 0) {
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
    const metaDesc =
      (html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "").trim();
    const parts: string[] = [];
    if (title) parts.push(`Title: ${title}`);
    if (metaDesc) parts.push(`Description: ${metaDesc}`);
    return parts.join("\n");
  }

  const bullets = items
    .map((item) => {
      const text = item.title.replace(/\s+/g, " ").trim();
      const targetUrl = item.url ? ` (${item.url})` : "";
      return `- ${text}${targetUrl}`;
    })
    .slice(0, 10)
    .join("\n");

  return `Top items:\n${bullets}`;
};

const buildPromptForPeek = ({
  url,
  snapshot = "",
}: {
  url: string;
  snapshot?: string;
}): string => {
  const lines = [
    "You're my quick-answer assistant.",
    "Task: Summarize the key information for this page in 5–7 bullets, then list 3 suggested next actions.",
    `URL: ${url}`,
    "Use the snapshot below if helpful. Do not ask me to paste content unless the snapshot is insufficient.",
    "If nothing sounds urgent, remind me to return to my priority work.",
  ];

  if (snapshot) {
    lines.push(`\n--- SNAPSHOT START ---\n${snapshot.slice(0, 2000)}\n--- SNAPSHOT END ---`);
  }

  return lines.join("\n");
};

const injectPromptIntoChatGPT = async (
  tabId: number,
  prompt: string,
  options: { autoSend?: boolean } = {}
): Promise<PeekInjectionStatus> => {
  const { autoSend = true } = options;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: async (text: string, autoSendFlag: boolean) => {
        const sleep = (ms: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, ms));

        const selectors = [
          "#prompt-textarea",
          '.ProseMirror[contenteditable="true"]',
          '[data-testid="prompt-textarea"]',
          "form textarea",
          "textarea",
          '[contenteditable="true"][role="textbox"]',
        ];

        const findInput = () => {
          for (const selector of selectors) {
            const el = document.querySelector(selector) as any;
            if (el) return el;
          }
          return null;
        };

        const setInputValue = (el: any, value: string) => {
          if (!el) return false;

          const isContentEditable =
            typeof el.getAttribute === "function" &&
            el.getAttribute("contenteditable") === "true";

          const ownerDoc = el.ownerDocument || document;
          const view = ownerDoc.defaultView || window;

          const createEvent = (EventCtor: any, type: string, init?: any) => {
            const fallbackCtor = view.Event || window.Event;
            try {
              return new EventCtor(type, init);
            } catch {
              return new fallbackCtor(type, init);
            }
          };

          const dispatchInputEvents = () => {
            const InputEventCtor = view.InputEvent || window.InputEvent || Event;
            const EventCtor = view.Event || window.Event;

            try {
              const ClipboardEventCtor =
                (view as any).ClipboardEvent ||
                (window as any).ClipboardEvent ||
                Event;
              const DataTransferCtor =
                (view as any).DataTransfer ||
                (window as any).DataTransfer;
              if (ClipboardEventCtor && DataTransferCtor) {
                const dataTransfer = new (DataTransferCtor as any)();
                if (typeof dataTransfer.setData === "function") {
                  dataTransfer.setData("text/plain", value);
                }
                const pasteEvt = createEvent(ClipboardEventCtor, "paste", {
                  bubbles: true,
                  cancelable: true,
                  clipboardData: dataTransfer,
                });
                el.dispatchEvent(pasteEvt);
              }
            } catch (clipErr) {
              console.debug("Peek paste event fallback failed", clipErr);
            }

            const beforeEvt = createEvent(InputEventCtor, "beforeinput", {
              bubbles: true,
              cancelable: true,
              data: value,
              inputType: "insertFromPaste",
            });
            el.dispatchEvent(beforeEvt);

            const inputEvt = createEvent(InputEventCtor, "input", {
              bubbles: true,
              cancelable: true,
              data: value,
              inputType: "insertText",
            });
            el.dispatchEvent(inputEvt);

            const changeEvt = createEvent(EventCtor, "change", { bubbles: true });
            el.dispatchEvent(changeEvt);
          };

          if (isContentEditable) {
            const proseMirrorView =
              (el as any).pmView ||
              (el as any).editorView ||
              (el as any).__pmView;

            if (
              proseMirrorView &&
              typeof proseMirrorView.dispatch === "function" &&
              proseMirrorView.state?.tr
            ) {
              try {
                const { state } = proseMirrorView;
                const docSize = state.doc?.content?.size ?? state.doc?.nodeSize ?? 0;
                const transaction = state.tr.insertText(value, 0, docSize);
                proseMirrorView.dispatch(transaction);
                if (typeof proseMirrorView.focus === "function") {
                  proseMirrorView.focus();
                } else if (typeof el.focus === "function") {
                  el.focus({ preventScroll: true });
                }
                dispatchInputEvents();
                return true;
              } catch (pmError) {
                console.warn("ProseMirror direct dispatch failed", pmError);
              }
            }

            if (typeof el.focus === "function") {
              try {
                el.focus({ preventScroll: true });
              } catch {
                el.focus();
              }
            }

            const selection = ownerDoc.getSelection?.();
            if (selection && ownerDoc.createRange) {
              const range = ownerDoc.createRange();
              range.selectNodeContents(el);
              selection.removeAllRanges();
              selection.addRange(range);
            }

            let inserted = false;
            const execCommand = ownerDoc.execCommand?.bind(ownerDoc);
            if (execCommand) {
              try {
                execCommand("insertText", false, value);
                inserted = true;
              } catch {
                inserted = false;
              }
            }

            if (!inserted) {
              while (el.firstChild) {
                el.removeChild(el.firstChild);
              }
              const paragraph = ownerDoc.createElement("p");
              const lines = String(value).split(/\r?\n/);
              if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
                paragraph.appendChild(ownerDoc.createElement("br"));
              } else {
                lines.forEach((line, idx) => {
                  if (idx > 0) {
                    paragraph.appendChild(ownerDoc.createElement("br"));
                  }
                  paragraph.appendChild(ownerDoc.createTextNode(line));
                });
              }
              paragraph.removeAttribute?.("data-placeholder");
              el.appendChild(paragraph);
            }

            dispatchInputEvents();
            return true;
          }

          if ("value" in el) {
            const prototypes: any[] = [];
            if (view.HTMLTextAreaElement?.prototype) {
              prototypes.push(view.HTMLTextAreaElement.prototype);
            }
            if (view.HTMLInputElement?.prototype) {
              prototypes.push(view.HTMLInputElement.prototype);
            }
            prototypes.push(Object.getPrototypeOf(el));

            let applied = false;
            for (const proto of prototypes) {
              if (!proto) continue;
              const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
              if (descriptor?.set) {
                descriptor.set.call(el, value);
                applied = true;
                break;
              }
            }

            if (!applied) {
              el.value = value;
            }

            dispatchInputEvents();
            return true;
          }

          return false;
        };

        const clickSend = async (inputEl: any) => {
          const button = document.querySelector(
            '[data-testid="send-button"], button[aria-label*="Send"], form button[type="submit"]'
          ) as any;
          if (!button) return false;

          const view = button.ownerDocument?.defaultView || window;
          const KeyboardEventCtor =
            view.KeyboardEvent || window.KeyboardEvent || Event;

          const attemptClick = () => {
            if (button.disabled) {
              return false;
            }
            button.click();
            return true;
          };

          if (attemptClick()) return true;

          // As a fallback, synthesize an Enter keypress to trigger send.
          const enterEvent = new KeyboardEventCtor("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true,
          });
          button.dispatchEvent(enterEvent);

          await sleep(50);

          if (!attemptClick() && inputEl) {
            const inputView = inputEl.ownerDocument?.defaultView || window;
            const InputKeyboardCtor =
              inputView.KeyboardEvent || window.KeyboardEvent || Event;
            const inputEnter = new InputKeyboardCtor("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true,
            });
            inputEl.dispatchEvent(inputEnter);
            await sleep(50);
          }

          return attemptClick();
        };

        for (let attempt = 0; attempt < 25; attempt++) {
          const input = findInput();
          if (input && setInputValue(input, text)) {
            if (typeof input.focus === "function") {
              input.focus();
            }
            if (autoSendFlag) {
              return (await clickSend(input)) ? "sent" : "filled";
            }
            return "filled";
          }
          await sleep(200);
        }

        try {
          await navigator.clipboard.writeText(text);
          return "clipboard";
        } catch (err) {
          console.warn("Peek prompt clipboard fallback failed", err);
          return "error";
        }
      },
      args: [prompt, autoSend],
    });

    const status = results?.[0]?.result;
    if (status === "sent" || status === "filled" || status === "clipboard" || status === "error") {
      return status;
    }
    return "unknown";
  } catch (error) {
    console.warn("injectPromptIntoChatGPT failed", error);
    return "error";
  }
};

const openChatGPTWithPrompt = async (prompt: string): Promise<PeekInjectionStatus> => {
  try {
    const tab = await chrome.tabs.create({ url: "https://chatgpt.com/" });
    if (typeof tab.id !== "number") {
      return "error";
    }

    const tabId = tab.id;
    return await new Promise<PeekInjectionStatus>((resolve) => {
      let finished = false;
      let safetyTimer: ReturnType<typeof setTimeout>;

      const finalize = (status: PeekInjectionStatus) => {
        if (finished) return;
        finished = true;
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.onRemoved.removeListener(handleRemoved);
        clearTimeout(safetyTimer);
        resolve(status);
      };

      const handleUpdated = async (
        updatedTabId: number,
        info: any
      ) => {
        if (finished) return;
        if (updatedTabId === tabId && info.status === "complete") {
          const status = await injectPromptIntoChatGPT(tabId, prompt, {
            autoSend: false,
          });
          finalize(status);
        }
      };

      const handleRemoved = (removedTabId: number) => {
        if (removedTabId === tabId) {
          finalize("error");
        }
      };

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);

      safetyTimer = setTimeout(async () => {
        if (finished) return;
        const status = await injectPromptIntoChatGPT(tabId, prompt, {
          autoSend: false,
        });
        finalize(status);
      }, 5000);
    });
  } catch (error) {
    console.warn("openChatGPTWithPrompt failed", error);
    return "error";
  }
};

const handlePeekWithChatGPTRequest = async (
  payload: PeekWithChatGPTMessage,
  sender?: any
) => {
  const siteFromPayload = sanitizeSite(payload.site);
  const siteFromSender = sanitizeSite(parseSiteFromSender(sender));
  const siteForStorage = siteFromPayload || siteFromSender;

  const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
  const originalUrl = ensureHttpUrl(payload.originalUrl);
  const trimmedOriginal = payload.originalUrl?.trim() || null;
  const tabNavigationUrl =
    tabId !== null ? await getTabNavigatedHttpUrl(tabId) : null;

  if (tabId !== null && getLastNavigatedUrlForTab(tabId) === null) {
    if (originalUrl) {
      setLastNavigatedUrlForTab(tabId, originalUrl, false);
    } else if (tabNavigationUrl) {
      setLastNavigatedUrlForTab(tabId, tabNavigationUrl, false);
    }
  }

  const ledgerUrl = tabId !== null ? getLastNavigatedUrlForTab(tabId) : null;
  const fallbackSiteUrl = siteForStorage
    ? ensureHttpUrl(`https://${siteForStorage}`)
    : null;
  const targetUrl = originalUrl || ledgerUrl || tabNavigationUrl || fallbackSiteUrl;
  await ensureFirefoxDataCollectionConsent(
    FIREFOX_PEEK_CHATGPT_DATA_COLLECTION_PERMISSIONS,
    "Peek with ChatGPT"
  );
  const snapshot = targetUrl ? await fetchSnapshot(targetUrl) : "";

  const storageUrl = targetUrl || fallbackSiteUrl || trimmedOriginal;

  const prompt = buildPromptForPeek({
    url:
      storageUrl ||
      (siteForStorage ? `https://${siteForStorage}` : "Unknown URL"),
    snapshot,
  });

  if (chrome.storage?.session?.set) {
    chrome.storage.session.set({
      [STORAGE_KEYS.lastPeekPrompt]: prompt,
      [STORAGE_KEYS.lastPeekSite]: siteForStorage,
      [STORAGE_KEYS.lastPeekUrl]: storageUrl,
    });
  }

  const status = await openChatGPTWithPrompt(prompt);
  return { status, prompt };
};

const handleRequestAccessMessage = async (
  message: RequestLocalIntentAccessMessage,
  sender?: any,
  onProgress?: (stage: AccessReviewProgressStage) => void
) => {
  const source =
    message.type === REQUEST_LLM_REVIEWED_ACCESS_MESSAGE_TYPE
      ? "llm-reviewed"
      : message.type === REQUEST_IF_THEN_INTENTION_ACCESS_MESSAGE_TYPE
      ? "if-then-intention"
      : message.type === REQUEST_BUILT_GATE_ACCESS_MESSAGE_TYPE
      ? "built-gate"
      : message.type === REQUEST_GITHUB_CONTRIBUTION_ACCESS_MESSAGE_TYPE
      ? "github-contribution"
      : message.type === REQUEST_AI_STUDY_QUIZ_ACCESS_MESSAGE_TYPE
      ? "ai-study-quiz"
      : null;
  if (!source) {
    throw new Error("Unsupported request access gate");
  }
  const requestedSite =
    sanitizeSite(message.currentSite) || sanitizeSite(parseSiteFromSender(sender));
  const requestedUrl = ensureHttpUrl(message.currentUrl) || ensureHttpUrl(message.url);
  const requestResult = await getTempAllowMinutes()
    .then((defaultMinutes) =>
      updateDailyStats((stats) =>
        withAccessRequested(
          stats,
          requestedSite,
          Number(message.requestedMinutes) || defaultMinutes,
          Date.now(),
          {
            scope: "domain",
            source,
            purpose: message.purpose,
            url: requestedUrl,
          }
        )
      )
    )
    .then(() =>
      message.type === REQUEST_LLM_REVIEWED_ACCESS_MESSAGE_TYPE
        ? requestLlmReviewedAccess(message, sender, onProgress)
        : message.type === REQUEST_IF_THEN_INTENTION_ACCESS_MESSAGE_TYPE
        ? requestIfThenIntentionAccess(message, sender)
        : message.type === REQUEST_BUILT_GATE_ACCESS_MESSAGE_TYPE
        ? requestBuiltGateAccess(message, sender)
        : message.type === REQUEST_GITHUB_CONTRIBUTION_ACCESS_MESSAGE_TYPE
        ? requestGithubContributionAccess(message, sender)
        : message.type === REQUEST_AI_STUDY_QUIZ_ACCESS_MESSAGE_TYPE
        ? requestAiStudyQuizAccess(message, sender)
        : Promise.reject(new Error("Unsupported request access gate"))
    );

  const { decision, ...allowResult } = requestResult;
  if (allowResult.ok) {
    await updateDailyStats((stats) =>
      withTemporaryAllow(stats, allowResult.host, allowResult.minutes, Date.now(), {
        scope: allowResult.scope,
        source,
        message: decision.message,
        purpose: message.purpose,
        url: allowResult.url,
        provider: allowResult.provider,
        model: allowResult.model,
        requestedMinutes: Number(message.requestedMinutes) || undefined,
      })
    );
  } else if (decision.decision === "FAIL" || decision.decision === "ASK_FOLLOWUP") {
    await updateDailyStats((stats) =>
      withRequestGateDecision(
        stats,
        {
          site: decision.host || message.currentSite || null,
          action: decision.decision === "ASK_FOLLOWUP" ? "request-follow-up" : "request-denied",
          scope: decision.scope,
          minutes: null,
          source,
          message: decision.message,
          purpose: message.purpose,
          url: decision.url,
          provider: allowResult.provider,
          model: allowResult.model,
        },
        Date.now()
      )
    );
  }

  const destination =
    allowResult.ok && allowResult.scope === "url"
      ? allowResult.url
      : allowResult.ok
      ? await getTemporarilyAllowedDestination(
          {
            type: TEMPORARY_ALLOW_MESSAGE_TYPE,
            url: message.url,
            scope: allowResult.scope === "url" ? "url" : "domain",
          } as TemporarilyAllowTabMessage,
          sender,
          {
            getLedgerUrl: getLastNavigatedUrlForTab,
            getTabNavigatedHttpUrl,
          }
        )
      : null;

  onProgress?.("complete");
  return {
    ok: allowResult.ok,
    decision,
    destination,
    challengeId: (allowResult as any).challengeId,
    question: (allowResult as any).question,
    topic: (allowResult as any).topic,
  };
};

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: SendResponse) => {
  if (message?.type === "get-block-page-actions") {
    getBlockPageActions()
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.warn("get-block-page-actions request failed", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }
  if (message?.type === "get-access-gate-actions") {
    sendResponse({ ok: true, actions: GATE_BLOCK_PAGE_ACTION_CAPABILITIES });
    return undefined;
  }
  if (message?.type === "get-active-temporary-allow") {
    const rawUrl =
      typeof message?.url === "string"
        ? message.url
        : typeof sender?.tab?.url === "string"
        ? sender.tab.url
        : null;
    flushActiveTemporaryAllowUsage()
      .then(() => getActiveTemporaryAllowDetails(rawUrl))
      .then((details) => sendResponse(details))
      .catch((error) => {
        console.warn("get-active-temporary-allow request failed", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }
  if (message?.type === "host-permissions-updated") {
    const refreshed = refreshRulesIfReady();
    sendResponse({ ok: refreshed });
    return undefined;
  }
  if (message?.type === "get-local-stats") {
    flushActiveTemporaryAllowUsage()
      .then(() => getDailyStats())
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch((error) => {
        console.warn("get-local-stats request failed", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }
  if (message?.type === "reset-today-local-stats") {
    updateDailyStats(() => createEmptyDailyStats(getLocalDayKey()))
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch((error) => {
        console.warn("reset-today-local-stats request failed", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }
  if (message?.type === "record-blocked-attempt") {
    const payload = message as RecordBlockedAttemptMessage;
    const site = sanitizeSite(payload.site) || sanitizeSite(parseSiteFromSender(sender));
    const ruleId = Number(payload.rid);
    if (Number.isInteger(ruleId) && ruleId > 0) {
      const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
      if (tabId !== null && !markBlockedAttemptRecordedForTab(tabId)) {
        sendResponse({ ok: true, recorded: false });
        return undefined;
      }
      updateDailyStats((stats) => withBlockedAttempt(stats, site))
        .then(() => sendResponse({ ok: true, recorded: true }))
        .catch((error) => {
          console.warn("record-blocked-attempt request failed", error);
          sendResponse({ ok: false, error: error?.message ?? String(error) });
        });
      return true;
    }
    sendResponse({ ok: false, error: "Missing rule id" });
    return undefined;
  }
  if (message?.type === CHATGPT_PEEK_MESSAGE_TYPE) {
    handlePeekWithChatGPTRequest(message as PeekWithChatGPTMessage, sender)
      .then((result) => {
        sendResponse({ status: result.status, prompt: result.prompt });
      })
      .catch((error) => {
        console.warn("peek-with-chatgpt request failed", error);
        sendResponse({ status: "error", error: error?.message ?? String(error) });
      });
    return true;
  }
  if (message?.type === TEMPORARY_ALLOW_MESSAGE_TYPE) {
    queueTemporaryAllowRequest(async () => {
      const allowResult = await temporarilyAllowFromUrl(
        message as TemporarilyAllowTabMessage,
        sender
      );
      if ("waiting" in allowResult && allowResult.waiting) {
        return allowResult;
      }
      if (allowResult.ok) {
        await updateDailyStats((stats) =>
          withTemporaryAllow(stats, allowResult.host, allowResult.minutes, Date.now(), {
            scope: allowResult.scope,
            source: "one-click",
            url: allowResult.url,
          })
        );
      }
      const destination =
        allowResult.ok && allowResult.scope === "url"
          ? allowResult.url
          : allowResult.ok
          ? await getTemporarilyAllowedDestination(
              message as TemporarilyAllowTabMessage,
              sender,
              {
                getLedgerUrl: getLastNavigatedUrlForTab,
                getTabNavigatedHttpUrl,
              }
            )
          : null;
      return {
        ok: allowResult.ok,
        destination,
      };
    })
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.warn("temporarily-allow-tab request failed", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }

  if (
    message?.type === REQUEST_LLM_REVIEWED_ACCESS_MESSAGE_TYPE ||
    message?.type === REQUEST_IF_THEN_INTENTION_ACCESS_MESSAGE_TYPE ||
    message?.type === REQUEST_BUILT_GATE_ACCESS_MESSAGE_TYPE ||
    message?.type === REQUEST_GITHUB_CONTRIBUTION_ACCESS_MESSAGE_TYPE ||
    message?.type === REQUEST_AI_STUDY_QUIZ_ACCESS_MESSAGE_TYPE
  ) {
    handleRequestAccessMessage(message as RequestLocalIntentAccessMessage, sender)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.warn("request-access gate request failed", error);
        sendResponse({ ok: false, error: error?.message ?? String(error) });
      });
    return true;
  }
  if (message?.type === "reblock-all-now") {
    reblockAllNow(message.tabId, message.url);
    sendResponse({ ok: true });
    return undefined;
  }
  return undefined;
});

if (chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port: any) => {
    if (port?.name !== ACCESS_REVIEW_PROGRESS_PORT) return;

    let disconnected = false;
    port.onDisconnect?.addListener(() => {
      disconnected = true;
    });

    const postMessage = (message: unknown) => {
      if (disconnected) return;
      try {
        port.postMessage(message);
      } catch {
        disconnected = true;
      }
    };

    port.onMessage?.addListener((message: any) => {
      if (
        message?.type !== REQUEST_LLM_REVIEWED_ACCESS_MESSAGE_TYPE &&
        message?.type !== REQUEST_IF_THEN_INTENTION_ACCESS_MESSAGE_TYPE &&
        message?.type !== REQUEST_BUILT_GATE_ACCESS_MESSAGE_TYPE &&
        message?.type !== REQUEST_GITHUB_CONTRIBUTION_ACCESS_MESSAGE_TYPE &&
        message?.type !== REQUEST_AI_STUDY_QUIZ_ACCESS_MESSAGE_TYPE
      ) {
        postMessage({ type: "result", response: { ok: false, error: "Unsupported request type" } });
        return;
      }

      handleRequestAccessMessage(
        message as RequestLocalIntentAccessMessage,
        port.sender,
        (stage) => postMessage({ type: "progress", stage })
      )
        .then((response) => postMessage({ type: "result", response }))
        .catch((error) => {
          console.warn("request-access port request failed", error);
          postMessage({
            type: "result",
            response: { ok: false, error: error?.message ?? String(error) },
          });
        });
    });
  });
}

// ---------- Lifecycle & Menus ----------

chrome.runtime.onInstalled.addListener(() => {
  // Context menu: Temporarily allow current site.
  chrome.contextMenus.create({
    id: TEMPORARILY_ALLOW_CONTEXT_MENU_ID,
    title: TEMPORARILY_ALLOW_CONTEXT_MENU_TITLE,
    contexts: ["action"],
  });

  // Context menu: Re-block ALL sites now (new canonical action).
  chrome.contextMenus.create({
    id: "reblock-all-now",
    title: "Re-block ALL sites now",
    contexts: ["action"],
  });
});

// Restore rules when the timer fires.
chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === ALARM_NAMES.accessEffectsRefresh) {
    pruneExpiredGrayscaleHosts();
    pruneExpiredTemporarilyAllowedUrls();
    syncActiveAccessEffectTabs();
    scheduleAccessEffectsRefreshAlarm();
    return;
  }

  if (alarm.name === ALARM_NAMES.badgeRefresh) {
    pruneExpiredGrayscaleHosts();
    const prunedTemporaryUrls = pruneExpiredTemporarilyAllowedUrls();
    if (prunedTemporaryUrls) refreshRulesIfReady();
    refreshBadgeForActiveTab();
    refreshActiveTemporaryAllowUsage();
    scheduleAccessEffectsRefreshAlarm();
    return;
  }

  if (alarm.name.startsWith("restore-url-")) {
    const id = parseInt(alarm.name.split("-")[2], 10);
    const allow = Number.isInteger(id) ? temporarilyAllowedUrls.get(id) : null;
    if (allow) {
      temporarilyAllowedUrls.delete(id);
      persistTemporarilyAllowedUrls();
      refreshRulesIfReady(() => redirectBlockedTabsForTemporaryUrl(allow));
      syncAccessEffectsForHostTabs(allow.host);
      refreshBadgeForActiveTab();
      refreshActiveTemporaryAllowUsage();
      scheduleAccessEffectsRefreshAlarm();
    }
    return;
  }

  if (alarm.name.startsWith("restore-")) {
    const id = parseInt(alarm.name.split("-")[1], 10);
    const site = blockedSites[id - 1];
    if (site) {
      const normalizedHost = normalizeHost(site);
      const temporaryAllowWindow = normalizedHost
        ? grayscaleHosts.get(normalizedHost)
        : null;
      stopActiveTemporaryAllowUsageForHost(
        normalizedHost,
        temporaryAllowWindow?.expiresAt ?? Date.now()
      );
      if (normalizedHost && grayscaleHosts.has(normalizedHost)) {
        grayscaleHosts.delete(normalizedHost);
        persistGrayscaleHosts();
        syncAccessEffectsForHostTabs(normalizedHost);
        refreshBadgeForActiveTab();
        scheduleAccessEffectsRefreshAlarm();
      }
      chrome.declarativeNetRequest.updateDynamicRules(
        { addRules: [buildRule(site, id)] },
        withLastErrorLog("alarm addRules", () => {
          if (normalizedHost) redirectBlockedTabsForHost(normalizedHost);
        })
      );
    }
  }
});

// ---------- Menu Click Handling ----------

chrome.contextMenus.onClicked.addListener((info: { menuItemId?: string | number }, tab?: ChromeTab) => {
  if (!tab?.url) return;

  if (info.menuItemId === TEMPORARILY_ALLOW_CONTEXT_MENU_ID) {
    queueTemporaryAllowRequest(async () => {
      const allowResult = await temporarilyAllowFromUrl(
        { type: "temporarily-allow-tab", url: tab.url, scope: "domain" },
        { tab }
      );
      if ("waiting" in allowResult && allowResult.waiting) {
        return;
      }
      if (!allowResult.ok) return;
      await updateDailyStats((stats) =>
        withTemporaryAllow(stats, allowResult.host, allowResult.minutes, Date.now(), {
          scope: allowResult.scope,
          source: "one-click",
          url: allowResult.url,
        })
      );
    })
      .catch((error) => {
        console.warn("context menu temporary allow failed", error);
      });
    return;
  }

  // Re-block ALL flows (new + legacy id mapped to same behavior).
  if (info.menuItemId === "reblock-all-now" || info.menuItemId === "reblock-now") {
    reblockAllNow(tab.id, tab.url);
    return;
  }
});
