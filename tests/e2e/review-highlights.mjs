const highlightId = "nodrift-review-highlight";

export function createReviewMomentRecorder({ enabled }) {
  const clear = async (page) => {
    if (!enabled) {
      return;
    }
    await page
      .evaluate((id) => document.querySelector(`#${id}`)?.remove(), highlightId)
      .catch(() => undefined);
  };

  const show = async (
    page,
    locator,
    label,
    { screenshotPath, fullPage = true, pauseMs = 1_400 } = {}
  ) => {
    if (!enabled) {
      if (screenshotPath) {
        await page.screenshot({ path: screenshotPath, fullPage });
      }
      return;
    }

    await locator.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" })
    );
    await page.waitForTimeout(100);
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Could not highlight review moment: ${label}`);
    }

    await page.evaluate(
      ({ box, highlightId, label }) => {
        document.querySelector(`#${highlightId}`)?.remove();

        const root = document.createElement("div");
        root.id = highlightId;
        root.setAttribute("aria-hidden", "true");
        Object.assign(root.style, {
          inset: "0",
          pointerEvents: "none",
          position: "fixed",
          zIndex: "2147483647",
        });

        const outline = document.createElement("div");
        Object.assign(outline.style, {
          border: "4px solid #f59e0b",
          borderRadius: "10px",
          boxShadow: "0 0 0 5px rgba(245, 158, 11, 0.24)",
          height: `${Math.max(0, box.height + 12)}px`,
          left: `${Math.max(4, box.x - 6)}px`,
          position: "fixed",
          top: `${Math.max(4, box.y - 6)}px`,
          width: `${Math.max(0, box.width + 12)}px`,
        });

        const caption = document.createElement("div");
        caption.textContent = label;
        Object.assign(caption.style, {
          background: "#111827",
          border: "2px solid #f59e0b",
          borderRadius: "8px",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.24)",
          color: "#ffffff",
          font: "800 16px/1.3 system-ui, sans-serif",
          left: `${Math.max(12, Math.min(box.x, window.innerWidth - 430))}px`,
          maxWidth: "410px",
          padding: "10px 13px",
          position: "fixed",
          top: `${Math.max(
            12,
            Math.min(box.y + box.height + 14, window.innerHeight - 68)
          )}px`,
        });

        root.append(outline, caption);
        document.body.append(root);
      },
      { box, highlightId, label }
    );

    await page.waitForTimeout(250);
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage });
    }
    await page.waitForTimeout(pauseMs);
    await clear(page);
  };

  return { show };
}
