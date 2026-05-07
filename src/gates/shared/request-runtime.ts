import {
  AccessGateDecision,
  DailyStatsContext,
} from "../../core/access-contracts.js";

export type RequestGateInput = {
  rawUrl?: string | null;
  requestedUrl?: string | null;
  currentSite?: string | null;
  blockedSites: string[];
  defaultMinutes: number;
  requestedText?: string | null;
  requestedMinutes?: number | null;
  followUpAnswer?: string | null;
  followUpCount?: number | null;
  challengeId?: string | null;
  stats?: DailyStatsContext;
};

export type RequestGateDecisionResult = {
  decision: AccessGateDecision;
  provider?: string | null;
  model?: string | null;
  challengeId?: string;
  question?: string;
  topic?: string;
};
