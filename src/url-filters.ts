export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildParentDomainUrlFilter = (site: string): string => `||${site}^`;

export const buildExactUrlRegexFilter = (url: string): string =>
  `^${escapeRegex(url)}$`;
