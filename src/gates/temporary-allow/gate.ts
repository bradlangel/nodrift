import { AccessGate, AccessRequestContext } from "../../core/access-contracts.js";
import { buildTemporaryAllowDecision } from "../../access-decisions.js";

export const temporaryAllowGate: AccessGate<AccessRequestContext> = {
  id: "temporary-allow",
  decide: (context) => buildTemporaryAllowDecision(context),
};
