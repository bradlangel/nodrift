import {
  GateModule,
  LocalIntentAccessRequestContext,
} from "../../core/access-contracts.js";
import { ifThenIntentionGate } from "./gate.js";
import { ifThenIntentionGateAction } from "./manifest.js";
import { ifThenIntentionGateOptions } from "./options.js";

export { ifThenIntentionGate } from "./gate.js";
export { ifThenIntentionGateAction } from "./manifest.js";
export { ifThenIntentionGateOptions } from "./options.js";

export const ifThenIntentionGateModule: GateModule<LocalIntentAccessRequestContext> = {
  id: ifThenIntentionGate.id,
  gate: ifThenIntentionGate,
  action: ifThenIntentionGateAction,
  options: ifThenIntentionGateOptions,
};
