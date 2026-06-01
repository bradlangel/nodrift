import { STALE_MODE_ACCESS_EFFECT_ID } from "../../defaults.js";
import type { AccessEffectModule } from "../types.js";

const MEDIA_SELECTOR = "img, picture, video, canvas, iframe";
const TEXT_SELECTOR = [
  "article :is(p, li, blockquote, h1, h2, h3, h4, h5, h6)",
  "[role='article'] :is(p, li, blockquote, h1, h2, h3, h4, h5, h6)",
  "main :is(p, li, blockquote, h1, h2, h3, h4, h5, h6)",
  "[role='main'] :is(p, li, blockquote, h1, h2, h3, h4, h5, h6)",
  "[role='feed'] :is(p, li, blockquote, h1, h2, h3)",
  ".md :is(p, li, blockquote)",
  "[slot='title']",
  "[slot='text-body']",
  "[slot='comment']",
].join(", ");
const OVERLAY_BASE_CSS = [
  "position: fixed",
  "inset: 0",
  "pointer-events: none",
  "z-index: 2147483647",
  "transition: backdrop-filter 180ms ease, background 180ms ease",
].join("; ");

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
        filter: grayscale(1) blur(0.3px) !important;
        opacity: 0.7 !important;
        transform: rotate(-0.45deg) skewX(-0.9deg) !important;
        transform-origin: left center !important;
        transition: filter 180ms ease, opacity 180ms ease, transform 180ms ease !important;
        will-change: filter, opacity, transform !important;
      }
    `;
  }

  if (progress >= 0.75) {
    return `
      ${TEXT_SELECTOR} {
        filter: grayscale(0.7) blur(0.12px) !important;
        opacity: 0.82 !important;
        transform: rotate(0.28deg) skewX(0.55deg) !important;
        transform-origin: left center !important;
        transition: filter 180ms ease, opacity 180ms ease, transform 180ms ease !important;
        will-change: filter, opacity, transform !important;
      }
    `;
  }

  if (progress >= 0.5) {
    return `
      ${TEXT_SELECTOR} {
        filter: grayscale(0.35) !important;
        opacity: 0.9 !important;
        transition: filter 180ms ease, opacity 180ms ease, transform 180ms ease !important;
      }
    `;
  }

  return `
    ${TEXT_SELECTOR} {
      transition: filter 180ms ease, opacity 180ms ease, transform 180ms ease !important;
    }
  `;
};

const buildOverlayCss = (progress: number): string | null => {
  if (progress >= 0.9) {
    return `
      ${OVERLAY_BASE_CSS};
      background:
        repeating-linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.08) 0,
          rgba(255, 255, 255, 0.08) 1px,
          transparent 1px,
          transparent 12px
        ),
        rgba(128, 128, 128, 0.12);
      backdrop-filter: grayscale(1) blur(1.2px) contrast(0.82);
      -webkit-backdrop-filter: grayscale(1) blur(1.2px) contrast(0.82);
    `;
  }

  if (progress >= 0.75) {
    return `
      ${OVERLAY_BASE_CSS};
      background: rgba(128, 128, 128, 0.07);
      backdrop-filter: grayscale(0.65) blur(0.45px) contrast(0.9);
      -webkit-backdrop-filter: grayscale(0.65) blur(0.45px) contrast(0.9);
    `;
  }

  return null;
};

export const staleModeAccessEffect: AccessEffectModule = {
  id: STALE_MODE_ACCESS_EFFECT_ID,
  label: "Slow Fade",
  description:
    "Progressively softens media, adds page haze, and tilts text as the granted window is used.",
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
      label: "Light fade",
      description: "Images, videos, canvas, and embedded frames become less colorful and slightly dimmer.",
    },
    {
      atPercent: 50,
      label: "Soft fade",
      description: "Media becomes grayer and lightly blurred; readable text starts to fade.",
    },
    {
      atPercent: 75,
      label: "Heavy fade",
      description: "A page haze appears and readable text starts to tilt.",
    },
    {
      atPercent: 90,
      label: "Almost done",
      description: "The haze strengthens, media is very blurred, and text is tougher to read.",
    },
  ],
  buildCss: ({ progress }) => `
    ${buildMediaCss(progress)}
    ${buildTextCss(progress)}
  `,
  buildOverlayCss: ({ progress }) => buildOverlayCss(progress),
};
