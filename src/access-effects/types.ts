export type AccessEffectSessionScope = "domain" | "url";

export type AccessEffectSession = {
  source: string | null;
  scope: AccessEffectSessionScope;
  host: string;
  url: string | null;
  startedAt: number;
  expiresAt: number;
};

export type AccessEffectCssContext = {
  session: AccessEffectSession;
  now: number;
  progress: number;
};

export type AccessEffectTimelineStep = {
  atPercent: number;
  label: string;
  description: string;
};

export type AccessEffectModule = {
  id: string;
  label: string;
  description: string;
  enabledByDefault: boolean;
  milestones: number[];
  timeline?: AccessEffectTimelineStep[];
  buildCss: (context: AccessEffectCssContext) => string | null;
  buildOverlayCss?: (context: AccessEffectCssContext) => string | null;
};
