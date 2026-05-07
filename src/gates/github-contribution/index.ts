import {
  GateModule,
  GithubContributionAccessRequestContext,
} from "../../core/access-contracts.js";
import { githubContributionGate } from "./gate.js";
import { githubContributionGateAction } from "./manifest.js";
import { githubContributionGateOptions } from "./options.js";

export { githubContributionGate, normalizeGithubUsername } from "./gate.js";
export { githubContributionGateAction } from "./manifest.js";
export { githubContributionGateOptions } from "./options.js";

export const githubContributionGateModule: GateModule<GithubContributionAccessRequestContext> = {
  id: githubContributionGate.id,
  gate: githubContributionGate,
  action: githubContributionGateAction,
  options: githubContributionGateOptions,
};
