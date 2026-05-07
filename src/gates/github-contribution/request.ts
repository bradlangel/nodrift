import { getLocalDayKey } from "../../stats.js";
import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "../shared/request-runtime.js";
import { githubContributionGate, normalizeGithubUsername } from "./gate.js";

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

export const decideGithubContributionRequest = async (
  input: RequestGateInput
): Promise<RequestGateDecisionResult> => {
  const username = typeof input.requestedText === "string" ? input.requestedText : "";
  const contributionDate = getLocalDayKey();
  let contributionCount: number | null = null;
  try {
    contributionCount = await fetchGithubContributionCount(username, contributionDate);
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
      requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
    }),
  };
};
