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

    if (context.contributionCount === null) {
      return failDecision(
        minutes,
        "I couldn't read today's public GitHub contribution count.",
        host,
        ruleIds
      );
    }

    if (context.contributionCount <= 0) {
      return failDecision(
        minutes,
        `No public GitHub contributions found for ${username} on ${context.contributionDate}.`,
        host,
        ruleIds
      );
    }

    return {
      decision: "PASS",
      scope: "domain",
      minutes,
      host,
      url: pickRequestedUrl(context),
      ruleIds,
      message: `Found ${context.contributionCount} public GitHub contribution${
        context.contributionCount === 1 ? "" : "s"
      } today.`,
    };
  },
};
