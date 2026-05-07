import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "../shared/request-runtime.js";
import { localIntentAccessGate } from "./gate.js";

export const decideLocalIntentRequest = (
  input: RequestGateInput
): RequestGateDecisionResult => ({
  decision: localIntentAccessGate.decide({
    rawUrl: input.rawUrl,
    requestedScope: "domain",
    requestedUrl: input.requestedUrl,
    blockedSites: input.blockedSites,
    defaultMinutes: input.defaultMinutes,
    requestedPurpose: typeof input.requestedText === "string" ? input.requestedText : "",
    requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
    currentUrl: input.requestedUrl,
    currentSite: input.currentSite,
    followUpAnswer: input.followUpAnswer,
    stats: input.stats,
  }),
});
