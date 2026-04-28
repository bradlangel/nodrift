export type AccessDecision = "PASS" | "PASS_WITH_LIMIT" | "FAIL" | "ASK_FOLLOWUP";
export type AccessDecisionScope = "domain" | "url" | "none";

export type DailyStatsContext = {
  blockedAttemptsToday: number;
  temporaryAllowsToday: number;
  temporaryAllowUsedSecondsToday: number;
  recentSiteDecisions: Array<{
    timestamp: number;
    decision: "blocked" | "temporary-allow";
    minutes?: number;
  }>;
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
  | "redirect"
  | "custom";

export type BlockPageActionCapability = {
  id: string;
  type: BlockPageActionType;
  messageType: string;
  visibleByDefault: boolean;
  description: string;
};

export type OptionalIntegration = {
  id: string;
  actionId: string;
  messageType: string;
  enabledByDefault: boolean;
};
