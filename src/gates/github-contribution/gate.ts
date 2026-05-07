import {
  AccessGate,
  AccessGateDecision,
  GithubContributionAccessRequestContext,
} from "../../core/access-contracts.js";
import {
  clampRequestedMinutes,
  failDecision,
  normalizeGateText,
  pickRequestedUrl,
  resolveHostAndRules,
} from "../shared/access-request.js";

export const normalizeGithubUsername = (value: string | null | undefined): string | null => {
  const trimmed = normalizeGateText(value).replace(/^@/, "");
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(trimmed)) return null;
  return trimmed;
};

const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

export const githubContributionGate: AccessGate<GithubContributionAccessRequestContext> = {
  id: "github-contribution-access",
  decide: (context): AccessGateDecision => {
    const minutes = clampRequestedMinutes(
      Number(context.requestedMinutes),
      context.defaultMinutes
    );
    const { host, ruleIds } = resolveHostAndRules(context);

    if (!host || ruleIds.length === 0) {
      return failDecision(minutes, "I couldn't determine which blocked site to allow.");
    }

    const username = normalizeGithubUsername(context.username);
    if (!username) {
      return failDecision(minutes, "Enter a valid GitHub username.", host, ruleIds);
    }

    const recentWindowMinutes = Math.max(
      Math.floor(Number(context.recentContributionWindowMinutes) || 120),
      1
    );
    const dailyThreshold = Math.max(
      Math.floor(Number(context.dailyContributionThreshold) || 20),
      1
    );
    const recentContributionCount =
      typeof context.recentContributionCount === "number" &&
      Number.isFinite(context.recentContributionCount)
        ? Math.max(Math.floor(context.recentContributionCount), 0)
        : null;
    const dailyContributionCount =
      typeof context.contributionCount === "number" &&
      Number.isFinite(context.contributionCount)
        ? Math.max(Math.floor(context.contributionCount), 0)
        : null;

    if (recentContributionCount !== null && recentContributionCount > 0) {
      return {
        decision: "PASS",
        scope: "domain",
        minutes,
        host,
        url: pickRequestedUrl(context),
        ruleIds,
        message: `Found ${pluralize(
          recentContributionCount,
          "public GitHub contribution event"
        )} in the last ${recentWindowMinutes} minutes.`,
      };
    }

    if (dailyContributionCount !== null && dailyContributionCount >= dailyThreshold) {
      return {
        decision: "PASS",
        scope: "domain",
        minutes,
        host,
        url: pickRequestedUrl(context),
        ruleIds,
        message: `Found ${pluralize(
          dailyContributionCount,
          "public GitHub contribution"
        )} today, meeting the ${dailyThreshold}-contribution threshold.`,
      };
    }

    if (recentContributionCount === null && dailyContributionCount === null) {
      return failDecision(
        minutes,
        "I couldn't read recent public GitHub activity or today's contribution count.",
        host,
        ruleIds
      );
    }

    return failDecision(
      minutes,
      `No public GitHub contribution events found for ${username} in the last ${recentWindowMinutes} minutes, and today's public contribution count is below ${dailyThreshold}.`,
      host,
      ruleIds
    );
  },
};
