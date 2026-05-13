import {
  BuiltGateAccessRequestContext,
  GateModule,
} from "../../core/access-contracts.js";
import { builtGate } from "./gate.js";
import { builtGateAction } from "./manifest.js";
import { builtGateOptions } from "./options.js";

export { builtGate } from "./gate.js";
export { builtGateAction } from "./manifest.js";
export { builtGateOptions } from "./options.js";
export {
  getBuiltGateSpec,
  normalizeBuiltGateSpec,
  normalizeBuiltGateSpecJson,
} from "./settings.js";
export type { BuiltGateSpec } from "./settings.js";

export const builtGateModule: GateModule<BuiltGateAccessRequestContext> = {
  id: builtGate.id,
  gate: builtGate,
  action: builtGateAction,
  options: builtGateOptions,
};
