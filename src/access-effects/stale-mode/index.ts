import { STALE_MODE_ACCESS_EFFECT_ID } from "../../defaults.js";
import type { AccessEffectModule } from "../types.js";

const MEDIA_SELECTOR = "img, picture, video, canvas, iframe";

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

export const staleModeAccessEffect: AccessEffectModule = {
  id: STALE_MODE_ACCESS_EFFECT_ID,
  label: "Stale Mode",
  description:
    "Progressively softens media as the granted window is used, making feeds less rewarding over time.",
  enabledByDefault: false,
  milestones: [0, 25, 50, 75, 90],
  timeline: [
    {
      atPercent: 0,
      label: "Start",
      description: "Media stays readable while NoDrift prepares smooth transitions.",
    },
    {
      atPercent: 25,
      label: "Mild stale",
      description: "Images, videos, canvas, and embedded frames become less colorful and slightly dimmer.",
    },
    {
      atPercent: 50,
      label: "Blocky stale",
      description: "Media becomes grayer, dimmer, and lightly blurred.",
    },
    {
      atPercent: 75,
      label: "Hard stale",
      description: "Media becomes strongly blurred and low contrast.",
    },
    {
      atPercent: 90,
      label: "Almost done",
      description: "Media is very blurred and dim shortly before the block returns.",
    },
  ],
  buildCss: ({ progress }) => `
    ${buildMediaCss(progress)}
  `,
};
