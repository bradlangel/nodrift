import type {
  RequestGateDecisionResult,
  RequestGateInput,
} from "../shared/request-runtime.js";
import { builtGate } from "./gate.js";
import { getBuiltGateSpec } from "./settings.js";

export const decideBuiltGateRequest = async (
  input: RequestGateInput
): Promise<RequestGateDecisionResult> => {
  const spec = await getBuiltGateSpec();
  return {
    decision: builtGate.decide({
      rawUrl: input.rawUrl,
      requestedScope: "domain",
      requestedUrl: input.requestedUrl,
      blockedSites: input.blockedSites,
      defaultMinutes: input.defaultMinutes,
      requestedPurpose: typeof input.requestedText === "string" ? input.requestedText : "",
      requestedMinutes: Number(input.requestedMinutes) || input.defaultMinutes,
      spec,
    }),
  };
};
