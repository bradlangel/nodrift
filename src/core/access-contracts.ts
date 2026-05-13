import type { GateOptionsDefinition } from "./options-contracts.js";

export type AccessDecision = "PASS" | "PASS_WITH_LIMIT" | "FAIL" | "ASK_FOLLOWUP";
export type AccessDecisionScope = "domain" | "url" | "none";
export type AccessReviewProgressStage =
  | "preparing"
  | "analyzing"
  | "reviewing"
  | "finalizing"
  | "complete";

export type DailyStatsContext = {
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowUsedSecondsToday: number;
  globalStatsToday?: {
    blockedAttemptsToday: number;
    temporaryAllowsToday: number;
    temporaryAllowUsedSecondsToday: number;
  };
  currentSiteStatsToday?: {
    site: string;
    blockedAttemptsToday: number;
    temporaryAllowsToday: number;
    temporaryAllowUsedSecondsToday: number;
    accessPressure: number | null;
    lastTemporaryAccessAt: number | null;
  } | null;
  categorySummaryToday?: Record<
    string,
    {
      accessRequestsToday: number;
      temporaryAllowsToday: number;
      requestDenialsToday: number;
      followUpsToday: number;
      grantedMinutesToday: number;
      requestedMinutesToday: number;
      temporaryAllowUsedSecondsToday: number;
    }
  >;
  recentSiteDecisions: Array<{
    timestamp: number;
    decision: "blocked" | "temporary-allow" | "request-denied" | "request-follow-up";
    minutes?: number;
    scope?: AccessDecisionScope;
    source?: string;
    category?: string;
    message?: string;
  }>;
  lastAccessByCategory?: Record<string, unknown>;
  lastAccessBySite?: unknown;
};

export type AccessRequestContext = {
  rawUrl?: string | null;
  requestedScope?: AccessDecisionScope;
  requestedUrl?: string | null;
  blockedSites: string[];
  defaultMinutes: number;
};

export type LocalIntentAccessRequestContext = AccessRequestContext & {
  requestedPurpose: string;
  requestedMinutes: number;
  currentUrl?: string | null;
  currentSite?: string | null;
  stats?: DailyStatsContext;
  followUpAnswer?: string | null;
};

export type LlmReviewedAccessRequestContext = AccessRequestContext & {
  requestedPurpose: string;
  requestedMinutes: number;
  currentUrl?: string | null;
  currentSite?: string | null;
  stats?: DailyStatsContext;
  followUpAnswer?: string | null;
  followUpCount?: number;
  maxMinutes: number;
  modelDecision: unknown;
};

export type GithubContributionAccessRequestContext = AccessRequestContext & {
  username: string;
  contributionDate: string;
  contributionCount: number | null;
  recentContributionCount?: number | null;
  recentContributionWindowMinutes?: number;
  dailyContributionThreshold?: number;
  requestedMinutes: number;
};

export type AiStudyQuizAccessRequestContext = AccessRequestContext & {
  topic: string;
  answer?: string | null;
  expectedAnswers?: string[][];
  requestedMinutes: number;
};

export type BuiltGateAccessRequestContext = AccessRequestContext & {
  requestedPurpose: string;
  requestedMinutes: number;
  spec: {
    name: string;
    description: string;
    questions: string[];
    requiredAnswerMinChars: number;
    denyKeywords: string[];
    approveKeywords: string[];
    urlScopeKeywords: string[];
    maxMinutes: number;
    successMessage: string;
    failureMessage: string;
  };
};

export type AccessGateDecision = {
  decision: AccessDecision;
  scope: AccessDecisionScope;
  minutes: number;
  host: string | null;
  url: string | null;
  ruleIds: number[];
  message?: string;
};

export type AccessGate<TContext = AccessRequestContext> = {
  id: string;
  decide: (context: TContext) => AccessGateDecision;
};

export type DecisionApplication =
  | {
      operation: "allow-domain";
      decision: AccessDecision;
      scope: "domain";
      minutes: number;
      host: string | null;
      ruleIds: number[];
    }
  | {
      operation: "allow-url";
      decision: AccessDecision;
      scope: "url";
      minutes: number;
      host: string;
      url: string;
    }
  | {
      operation: "none";
      decision: AccessDecision;
      scope: AccessDecisionScope;
      minutes: number;
      message?: string;
    };

export type BlockPageActionType =
  | "temporary-allow"
  | "request-access"
  | "peek-chatgpt"
  | "custom";

export type BlockPageActionCapability = {
  id: string;
  type: BlockPageActionType;
  messageType?: string;
  visibleByDefault: boolean;
  description: string;
  label: string;
  settingsLabel?: string;
  buttonId?: string;
  pendingLabel?: string;
  scope?: AccessDecisionScope;
  className?: string;
  title?: string;
  formTitle?: string;
  formPlaceholder?: string;
  formInitialValue?: string;
  submitLabel?: string;
  waitingLabel?: string;
};

export type OptionalIntegration = {
  id: string;
  actionId: string;
  messageType: string;
  enabledByDefault: boolean;
};

export type GateModule<TContext = any> = {
  id: string;
  gate: AccessGate<TContext>;
  action: BlockPageActionCapability;
  options?: GateOptionsDefinition;
  integrations?: OptionalIntegration[];
  isConfigured?: (settings: unknown) => boolean;
};
