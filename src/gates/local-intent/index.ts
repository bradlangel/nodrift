import {
  GateModule,
  LocalIntentAccessRequestContext,
} from "../../core/access-contracts.js";
import { localIntentAccessGate } from "./gate.js";
import { localIntentGateAction } from "./manifest.js";
import { localIntentGateOptions } from "./options.js";

export { localIntentAccessGate } from "./gate.js";
export { localIntentGateAction } from "./manifest.js";
export { localIntentGateOptions } from "./options.js";

export const localIntentGateModule: GateModule<LocalIntentAccessRequestContext> = {
  id: localIntentAccessGate.id,
  gate: localIntentAccessGate,
  action: localIntentGateAction,
  options: localIntentGateOptions,
};
