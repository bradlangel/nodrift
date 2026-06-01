import { GRAYSCALE_ACCESS_EFFECT_ID } from "../../defaults.js";
import type { AccessEffectModule } from "../types.js";

export const grayscaleAccessEffect: AccessEffectModule = {
  id: GRAYSCALE_ACCESS_EFFECT_ID,
  label: "Grayscale",
  description: "Remove color from temporarily allowed sites.",
  enabledByDefault: true,
  milestones: [0],
  timeline: [
    {
      atPercent: 0,
      label: "Immediately",
      description: "The whole temporarily allowed page becomes grayscale.",
    },
  ],
  buildCss: () => "html { filter: grayscale(1) !important; }",
};
