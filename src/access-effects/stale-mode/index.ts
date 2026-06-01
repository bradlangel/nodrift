import { STALE_MODE_ACCESS_EFFECT_ID } from "../../defaults.js";
import type { AccessEffectModule } from "../types.js";

const MEDIA_SELECTOR = "img, picture, video, canvas, iframe";
const READABLE_TEXT_SELECTOR = [
  "article :is(p, span, li, blockquote, h1, h2, h3)",
  "[role='article'] :is(p, span, li, blockquote, h1, h2, h3)",
  "main :is(p, li, blockquote, h1, h2, h3, h4, h5, h6)",
  "[role='main'] :is(p, li, blockquote, h1, h2, h3, h4, h5, h6)",
  ".md :is(p, li, blockquote)",
  "[slot='title']",
  "[slot='text-body']",
  "[slot='comment']",
].join(", ");
const FEED_TEXT_SELECTOR = [
  "[role='feed'] :is(p, span, a, li, blockquote, h1, h2, h3)",
  "[data-testid*='post'] :is(p, span, a, h1, h2, h3)",
  "[data-testid*='comment'] :is(p, span, div)",
  "[class*='post' i] :is(p, span, a, h1, h2, h3)",
  "[class*='comment' i] :is(p, span, div)",
  "[class*='feed' i] :is(p, span, a, h1, h2, h3)",
].join(", ");
const TEXT_SELECTOR = [READABLE_TEXT_SELECTOR, FEED_TEXT_SELECTOR].join(", ");
const CUSTOM_FEED_CONTAINER_SELECTOR = "shreddit-post, shreddit-comment";
const INTERACTIVE_RESET_SELECTOR = [
  "button",
  "[role='button']",
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable='true']",
  "nav",
  "[role='navigation']",
].join(", ");

const buildInteractiveResetCss = (): string => `
  ${INTERACTIVE_RESET_SELECTOR},
  ${INTERACTIVE_RESET_SELECTOR} * {
    filter: none !important;
    opacity: 1 !important;
  }
`;

const buildMediaCss = (progress: number): string => {
  if (progress >= 0.9) {
    return `
      ${MEDIA_SELECTOR} {
        filter: grayscale(1) blur(10px) contrast(0.72) !important;
        opacity: 0.32 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }
    `;
  }

  if (progress >= 0.75) {
    return `
      ${MEDIA_SELECTOR} {
        filter: grayscale(1) blur(6px) contrast(0.78) !important;
        opacity: 0.45 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }
    `;
  }

  if (progress >= 0.5) {
    return `
      ${MEDIA_SELECTOR} {
        filter: grayscale(0.85) blur(2px) saturate(0.45) contrast(0.82) !important;
        opacity: 0.68 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }
    `;
  }

  if (progress >= 0.25) {
    return `
      ${MEDIA_SELECTOR} {
        filter: grayscale(0.45) saturate(0.55) contrast(0.88) !important;
        opacity: 0.82 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }
    `;
  }

  return `
    ${MEDIA_SELECTOR} {
      transition: filter 180ms ease, opacity 180ms ease !important;
    }
  `;
};

const buildTextCss = (progress: number): string => {
  if (progress >= 0.9) {
    return `
      ${TEXT_SELECTOR} {
        filter: grayscale(1) blur(0.45px) !important;
        opacity: 0.5 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }

      ${CUSTOM_FEED_CONTAINER_SELECTOR} {
        filter: grayscale(1) blur(0.35px) !important;
        opacity: 0.62 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }

      ${buildInteractiveResetCss()}
    `;
  }

  if (progress >= 0.75) {
    return `
      ${TEXT_SELECTOR} {
        filter: grayscale(0.8) !important;
        opacity: 0.64 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }

      ${CUSTOM_FEED_CONTAINER_SELECTOR} {
        filter: grayscale(0.8) !important;
        opacity: 0.78 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }

      ${buildInteractiveResetCss()}
    `;
  }

  if (progress >= 0.5) {
    return `
      ${TEXT_SELECTOR} {
        filter: grayscale(0.4) !important;
        opacity: 0.78 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }

      ${CUSTOM_FEED_CONTAINER_SELECTOR} {
        filter: grayscale(0.4) !important;
        opacity: 0.9 !important;
        transition: filter 180ms ease, opacity 180ms ease !important;
      }
    `;
  }

  return `
    ${TEXT_SELECTOR} {
      transition: filter 180ms ease, opacity 180ms ease !important;
    }

    ${CUSTOM_FEED_CONTAINER_SELECTOR} {
      transition: filter 180ms ease, opacity 180ms ease !important;
    }
  `;
};

export const staleModeAccessEffect: AccessEffectModule = {
  id: STALE_MODE_ACCESS_EFFECT_ID,
  label: "Stale Mode",
  description:
    "Progressively softens media and fades text as the granted window is used, making feeds less rewarding over time.",
  enabledByDefault: false,
  milestones: [0, 25, 50, 75, 90],
  timeline: [
    {
      atPercent: 0,
      label: "Start",
      description: "The page stays readable while NoDrift prepares smooth transitions.",
    },
    {
      atPercent: 25,
      label: "Mild stale",
      description: "Images, videos, canvas, and embedded frames become less colorful and slightly dimmer.",
    },
    {
      atPercent: 50,
      label: "Blocky stale",
      description: "Media becomes grayer, dimmer, and lightly blurred; feed text starts to fade.",
    },
    {
      atPercent: 75,
      label: "Hard stale",
      description: "Media becomes strongly blurred; feed and article text get lower contrast.",
    },
    {
      atPercent: 90,
      label: "Almost done",
      description: "Media is very blurred and text is faded shortly before the block returns.",
    },
  ],
  buildCss: ({ progress }) => `
    ${buildMediaCss(progress)}
    ${buildTextCss(progress)}
  `,
};
