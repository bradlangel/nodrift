import { AccessGateDecision, DecisionApplication } from "./access-contracts.js";

const isPassingDecision = (decision: AccessGateDecision): boolean =>
  decision.decision === "PASS" || decision.decision === "PASS_WITH_LIMIT";

export const buildDecisionApplication = (
  decision: AccessGateDecision
): DecisionApplication => {
  if (isPassingDecision(decision) && decision.scope === "domain") {
    return {
      operation: "allow-domain",
      decision: decision.decision,
      scope: "domain",
      minutes: decision.minutes,
      host: decision.host,
      ruleIds: decision.ruleIds,
    };
  }

  if (
    isPassingDecision(decision) &&
    decision.scope === "url" &&
    decision.host &&
    decision.url
  ) {
    return {
      operation: "allow-url",
      decision: decision.decision,
      scope: "url",
      minutes: decision.minutes,
      host: decision.host,
      url: decision.url,
    };
  }

  return {
    operation: "none",
    decision: decision.decision,
    scope: decision.scope,
    minutes: decision.minutes,
    message: decision.message,
  };
};
