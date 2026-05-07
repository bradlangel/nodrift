import {
  BlockPageActionCapability,
  GateModule,
  OptionalIntegration,
} from "../core/access-contracts.js";
import { aiStudyQuizGateModule } from "./ai-study-quiz/index.js";
import { githubContributionGateModule } from "./github-contribution/index.js";
import { ifThenIntentionGateModule } from "./if-then-intention/index.js";
import { llmReviewedGateModule } from "./llm-reviewed/index.js";
import { localIntentGateModule } from "./local-intent/index.js";
import { temporaryAllowGateModule } from "./temporary-allow/index.js";

export const GATE_MODULES: Array<GateModule<any>> = [
  temporaryAllowGateModule,
  localIntentGateModule,
  llmReviewedGateModule,
  ifThenIntentionGateModule,
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
