import { getLocalDayKey } from "../../stats.js";
import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "../shared/request-runtime.js";
import { githubContributionGate, normalizeGithubUsername } from "./gate.js";
import {
  getGithubContributionSettings,
  normalizeGithubContributionRecentWindowMinutes,
  saveGithubContributionUsername,
} from "./settings.js";

const CONTRIBUTION_EVENT_TYPES = new Set([
  "CommitCommentEvent",
  "IssueCommentEvent",
  "IssuesEvent",
  "PullRequestEvent",
  "PullRequestReviewCommentEvent",
  "PullRequestReviewEvent",
  "PushEvent",
]);

const CONTRIBUTION_EVENT_ACTIONS = new Set([
  "created",
  "opened",
  "reopened",
  "submitted",
  "synchronize",
]);

const getGithubContributionEventWeight = (event: unknown): number => {
  if (!event || typeof event !== "object") return 0;
  const maybeEvent = event as {
    type?: unknown;
    payload?: { action?: unknown; commits?: unknown };
  };
  const type = typeof maybeEvent.type === "string" ? maybeEvent.type : "";
  if (!CONTRIBUTION_EVENT_TYPES.has(type)) return 0;

  if (type === "PushEvent") {
    const commits = Array.isArray(maybeEvent.payload?.commits)
      ? maybeEvent.payload.commits.length
      : 0;
    return Math.max(commits, 1);
  }

  const action =
    typeof maybeEvent.payload?.action === "string" ? maybeEvent.payload.action : "";
  if (action && !CONTRIBUTION_EVENT_ACTIONS.has(action)) return 0;
  return 1;
};

export const countRecentGithubContributionEvents = (
  events: unknown,
  now = Date.now(),
  windowMinutes = normalizeGithubContributionRecentWindowMinutes(null)
): number | null => {
  if (!Array.isArray(events)) return null;
  const earliest = now - windowMinutes * 60 * 1000;
  const latest = now + 5 * 60 * 1000;
  return events.reduce((count, event) => {
    const maybeEvent = event as { created_at?: unknown };
    const createdAt = Date.parse(
      typeof maybeEvent.created_at === "string" ? maybeEvent.created_at : ""
    );
    if (!Number.isFinite(createdAt) || createdAt < earliest || createdAt > latest) {
      return count;
    }
    return count + getGithubContributionEventWeight(event);
  }, 0);
};

export const fetchGithubContributionCount = async (
  username: string,
  dateKey: string
): Promise<number | null> => {
  const normalizedUsername = normalizeGithubUsername(username);
  if (!normalizedUsername) return null;

  const response = await fetch(
    `https://github.com/users/${encodeURIComponent(normalizedUsername)}/contributions`
  );
  if (!response.ok) return null;

  const html = await response.text();
  const dateTag = html.match(new RegExp(`<[^>]*data-date=["']${dateKey}["'][^>]*>`, "i"));
  const tag = dateTag?.[0] || "";
  const count = tag.match(/\bdata-count=["'](\d+)["']/i);
  if (count) return Number(count[1]);

  const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
  if (!id) return null;

  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tooltip = html.match(
    new RegExp(`<tool-tip\\b[^>]*\\bfor=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/tool-tip>`, "i")
  )?.[1];
  if (!tooltip) return null;

  const label = tooltip.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (/^no contributions\b/i.test(label)) return 0;
  const tooltipCount = label.match(/\b(\d+)\s+contribution/i);
  return tooltipCount ? Number(tooltipCount[1]) : null;
};

export const fetchRecentGithubContributionCount = async (
  username: string,
  now = Date.now(),
  windowMinutes = normalizeGithubContributionRecentWindowMinutes(null)
): Promise<number | null> => {
  const normalizedUsername = normalizeGithubUsername(username);
  if (!normalizedUsername) return null;

  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(
      normalizedUsername
    )}/events/public?per_page=30`
  );
  if (!response.ok) return null;

  return countRecentGithubContributionEvents(
    await response.json(),
    now,
    windowMinutes
  );
};

export const decideGithubContributionRequest = async (
  input: RequestGateInput
): Promise<RequestGateDecisionResult> => {
  const settings = await getGithubContributionSettings();
  const submittedUsername =
    typeof input.requestedText === "string" ? input.requestedText : "";
  const normalizedSubmittedUsername = normalizeGithubUsername(submittedUsername);
  const username = normalizedSubmittedUsername || settings.username;
  if (normalizedSubmittedUsername && normalizedSubmittedUsername !== settings.username) {
    await saveGithubContributionUsername(normalizedSubmittedUsername);
  }
  const contributionDate = getLocalDayKey();
  let contributionCount: number | null = null;
  let recentContributionCount: number | null = null;
  try {
    [contributionCount, recentContributionCount] = await Promise.all([
      fetchGithubContributionCount(username, contributionDate).catch(() => null),
      fetchRecentGithubContributionCount(
        username,
        Date.now(),
        settings.recentWindowMinutes
      ).catch(() => null),
    ]);
  } catch (error) {
    console.warn("github-contribution request failed", error);
  }

  return {
    decision: githubContributionGate.decide({
      rawUrl: input.rawUrl,
      requestedScope: "domain",
      requestedUrl: input.requestedUrl,
      blockedSites: input.blockedSites,
      defaultMinutes: input.defaultMinutes,
      username,
      contributionDate,
      contributionCount,
      recentContributionCount,
      recentContributionWindowMinutes: settings.recentWindowMinutes,
      dailyContributionThreshold: settings.dailyContributionThreshold,
      requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
    }),
  };
};
