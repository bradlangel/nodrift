import { DEFAULT_ACCESS_EFFECT_IDS } from "../defaults.js";
import { grayscaleAccessEffect } from "./grayscale/index.js";
import { staleModeAccessEffect } from "./stale-mode/index.js";
import type {
  AccessEffectCssContext,
  AccessEffectModule,
} from "./types.js";

export const ACCESS_EFFECT_MODULES: AccessEffectModule[] = [
  grayscaleAccessEffect,
  staleModeAccessEffect,
];

const ACCESS_EFFECT_MODULES_BY_ID = new Map(
  ACCESS_EFFECT_MODULES.map((module) => [module.id, module])
);

export const normalizeAccessEffectIds = (
  value: unknown,
  fallback: string[] = DEFAULT_ACCESS_EFFECT_IDS
): string[] => {
  const rawIds = Array.isArray(value) ? value : fallback;
  const normalized: string[] = [];
  for (const rawId of rawIds) {
    const id = String(rawId || "");
    if (!ACCESS_EFFECT_MODULES_BY_ID.has(id) || normalized.includes(id)) continue;
    normalized.push(id);
  }
  return normalized;
};

export const getAccessEffectModules = (ids: string[]): AccessEffectModule[] =>
  normalizeAccessEffectIds(ids, []).flatMap((id) => {
    const module = ACCESS_EFFECT_MODULES_BY_ID.get(id);
    return module ? [module] : [];
  });

export const buildAccessEffectCss = (
  ids: string[],
  context: AccessEffectCssContext
): string => {
  const css = getAccessEffectModules(ids)
    .map((module) => module.buildCss(context))
    .filter((chunk): chunk is string => !!chunk && !!chunk.trim())
    .join("\n");

  return css.trim();
};

export const getAccessEffectMilestones = (ids: string[]): number[] => {
  const milestones = new Set<number>();
  getAccessEffectModules(ids).forEach((module) => {
    module.milestones.forEach((milestone) => {
      if (!Number.isFinite(milestone)) return;
      milestones.add(Math.min(Math.max(milestone, 0), 100));
    });
  });
  return Array.from(milestones).sort((a, b) => a - b);
};
