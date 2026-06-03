import { expect, test } from "@playwright/test";

import {
  buildAccessEffectCss,
  buildAccessEffectOverlayCss,
} from "../../dist/access-effects/registry.js";
import {
  GRAYSCALE_ACCESS_EFFECT_ID,
  STALE_MODE_ACCESS_EFFECT_ID,
} from "../../dist/defaults.js";

const fixtureUrl = new URL("./fixtures/access-effects.html", import.meta.url).href;

const session = {
  source: "temporary-allow",
  scope: "domain",
  host: "example.com",
  url: "https://example.com/research-thread",
  startedAt: 1_000,
  expiresAt: 61_000,
};

const contextForProgress = (progressPercent) => {
  const progress = progressPercent / 100;
  return {
    session,
    progress,
    now: session.startedAt + (session.expiresAt - session.startedAt) * progress,
  };
};

const applyAccessEffects = async (page, ids, progressPercent) => {
  const context = contextForProgress(progressPercent);
  const css = buildAccessEffectCss(ids, context);
  const overlayCss = buildAccessEffectOverlayCss(ids, context);

  await page.evaluate(
    ({ css, overlayCss }) => {
      const styleId = "nodrift-access-effects-style";
      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = css;

      const overlayId = "nodrift-access-effects-overlay";
      let overlay = document.getElementById(overlayId);
      if (overlayCss) {
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = overlayId;
          overlay.setAttribute("aria-hidden", "true");
          document.body.appendChild(overlay);
        }
        overlay.style.cssText = overlayCss;
      } else {
        overlay?.remove();
      }
    },
    { css, overlayCss }
  );

  await page.waitForTimeout(220);
};

test.describe("Access Effects visuals", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(fixtureUrl);
    await page.evaluate(() => document.fonts?.ready);
  });

  test("grayscale effect", async ({ page }) => {
    await applyAccessEffects(page, [GRAYSCALE_ACCESS_EFFECT_ID], 0);

    await expect(page).toHaveScreenshot("grayscale.png", {
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      maxDiffPixelRatio: 0.01,
    });
  });

  for (const progressPercent of [0, 25, 50, 75, 90]) {
    test(`slow fade at ${progressPercent}%`, async ({ page }) => {
      await applyAccessEffects(page, [STALE_MODE_ACCESS_EFFECT_ID], progressPercent);

      await expect(page).toHaveScreenshot(`slow-fade-${progressPercent}.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
