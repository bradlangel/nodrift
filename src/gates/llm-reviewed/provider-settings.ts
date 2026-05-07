import {
  DEFAULT_LLM_LEISURE_ALLOWANCE,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_REVIEW_STRICTNESS,
  DEFAULT_OPENAI_MODEL,
} from "../../defaults.js";
import { STORAGE_KEYS } from "../../storage-constants.js";
import { normalizeReviewLevel } from "./policy.js";
import { hasChromeLocalProviderConfig } from "./providers/chrome-local.js";

type StorageItems = Record<string, any>;

export type LlmProviderSettings = {
  provider: string;
  model: string;
  apiKey: string;
  reviewStrictnessLevel: 1 | 2 | 3 | 4 | 5;
  leisureAllowanceLevel: 1 | 2 | 3 | 4 | 5;
};

export const getLlmProviderSettings = (): Promise<LlmProviderSettings> =>
  new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        [STORAGE_KEYS.llmProvider]: DEFAULT_LLM_PROVIDER,
        [STORAGE_KEYS.llmReviewStrictness]: DEFAULT_LLM_REVIEW_STRICTNESS,
        [STORAGE_KEYS.llmLeisureAllowance]: DEFAULT_LLM_LEISURE_ALLOWANCE,
        [STORAGE_KEYS.openAiModel]: DEFAULT_OPENAI_MODEL,
      },
      (syncData: StorageItems) => {
        chrome.storage.local.get({ [STORAGE_KEYS.openAiApiKey]: "" }, (localData: StorageItems) => {
          resolve({
            provider: String(syncData[STORAGE_KEYS.llmProvider] || DEFAULT_LLM_PROVIDER),
            model: String(syncData[STORAGE_KEYS.openAiModel] || DEFAULT_OPENAI_MODEL),
            apiKey: String(localData[STORAGE_KEYS.openAiApiKey] || ""),
            reviewStrictnessLevel: normalizeReviewLevel(syncData[STORAGE_KEYS.llmReviewStrictness]),
            leisureAllowanceLevel: normalizeReviewLevel(syncData[STORAGE_KEYS.llmLeisureAllowance]),
          });
        });
      }
    );
  });

export const getLlmModelLabel = (provider: { provider: string; model: string }): string =>
  hasChromeLocalProviderConfig(provider)
    ? "Chrome local LLM (Gemini Nano)"
    : provider.model;
