import {
  DEFAULT_GITHUB_CONTRIBUTION_DAILY_THRESHOLD,
  DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES,
  DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
} from "../../defaults.js";
import { STORAGE_KEYS } from "../../storage-constants.js";
import { normalizeGithubUsername } from "./gate.js";

type StorageItems = Record<string, any>;

const RECENT_WINDOW_MINUTES_MIN = 15;
const RECENT_WINDOW_MINUTES_MAX = 480;

export type GithubContributionSettings = {
  username: string;
  recentWindowMinutes: number;
  dailyContributionThreshold: number;
};

export const normalizeGithubContributionRecentWindowMinutes = (
  value: unknown
): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES;
  }
  return Math.min(
    Math.max(parsed, RECENT_WINDOW_MINUTES_MIN),
    RECENT_WINDOW_MINUTES_MAX
  );
};

export const getGithubContributionSettings =
  (): Promise<GithubContributionSettings> =>
    new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          [STORAGE_KEYS.githubContributionUsername]:
            DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
          [STORAGE_KEYS.githubContributionRecentWindowMinutes]:
            DEFAULT_GITHUB_CONTRIBUTION_RECENT_WINDOW_MINUTES,
        },
        (items: StorageItems) => {
          resolve({
            username:
              normalizeGithubUsername(items[STORAGE_KEYS.githubContributionUsername]) ??
              DEFAULT_GITHUB_CONTRIBUTION_USERNAME,
            recentWindowMinutes: normalizeGithubContributionRecentWindowMinutes(
              items[STORAGE_KEYS.githubContributionRecentWindowMinutes]
            ),
            dailyContributionThreshold: DEFAULT_GITHUB_CONTRIBUTION_DAILY_THRESHOLD,
          });
        }
      );
    });

export const saveGithubContributionUsername = (username: string): Promise<void> =>
  new Promise((resolve) => {
    const normalized =
      normalizeGithubUsername(username) ?? DEFAULT_GITHUB_CONTRIBUTION_USERNAME;
    chrome.storage.sync.set(
      { [STORAGE_KEYS.githubContributionUsername]: normalized },
      () => resolve()
    );
  });
