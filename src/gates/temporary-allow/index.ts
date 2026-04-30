import { AccessRequestContext, GateModule } from "../../core/access-contracts.js";
import { temporaryAllowGate } from "./gate.js";
import { temporaryAllowGateAction } from "./manifest.js";

export { temporaryAllowGate } from "./gate.js";
export { temporaryAllowGateAction } from "./manifest.js";

export const temporaryAllowGateModule: GateModule<AccessRequestContext> = {
  id: temporaryAllowGate.id,
  gate: temporaryAllowGate,
  action: temporaryAllowGateAction,
};
