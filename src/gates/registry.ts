import {
  BlockPageActionCapability,
  GateModule,
  OptionalIntegration,
} from "../core/access-contracts.js";
import { aiStudyQuizGateModule } from "./ai-study-quiz/index.js";
import { builtGateModule } from "./built-gate/index.js";
import { githubContributionGateModule } from "./github-contribution/index.js";
import { ifThenIntentionGateModule } from "./if-then-intention/index.js";
import { llmReviewedGateModule } from "./llm-reviewed/index.js";
import { temporaryAllowGateModule } from "./temporary-allow/index.js";

export const GATE_MODULES: Array<GateModule<any>> = [
  temporaryAllowGateModule,
  llmReviewedGateModule,
  ifThenIntentionGateModule,
  builtGateModule,
  githubContributionGateModule,
  aiStudyQuizGateModule,
];

export const GATE_BLOCK_PAGE_ACTION_CAPABILITIES: BlockPageActionCapability[] =
  GATE_MODULES.map((module) => module.action);

export const GATE_OPTIONAL_INTEGRATIONS: OptionalIntegration[] =
  GATE_MODULES.flatMap((module) => module.integrations ?? []);

export const findGateModuleByActionId = (
  actionId: string
): GateModule<any> | null =>
  GATE_MODULES.find((module) => module.action.id === actionId) ?? null;

export const findGateModuleByMessageType = (
  messageType: string
): GateModule<any> | null =>
  GATE_MODULES.find((module) => module.action.messageType === messageType) ?? null;
