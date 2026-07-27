import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect, test } from "@playwright/test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");
const fixturePath = path.join(
  repoRoot,
  "tests/e2e/fixtures/blocked-site.html"
);
const recordDemo = process.env.NODRIFT_RECORD_ALLOW_DELAY_DEMO === "1";
const demoDir = path.join(repoRoot, "test-results/demos");

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const startFixtureServer = async () => {
  const fixture = await readFile(fixturePath, "utf8");
  const server = createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(fixture);
  });
  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Could not determine the local fixture port.");
  }
  return { server, port: address.port };
};

const waitForExtensionServiceWorker = async (context) => {
  const existing = context.serviceWorkers()[0];
  return existing ?? context.waitForEvent("serviceworker");
};

const setExtensionStorage = async (worker, area, values) => {
  await worker.evaluate(
    ({ area, values }) =>
      new Promise((resolve, reject) => {
        chrome.storage[area].set(values, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      }),
    { area, values }
  );
};

const clearExtensionStorage = async (worker, area) => {
  await worker.evaluate(
    (area) =>
      new Promise((resolve, reject) => {
        chrome.storage[area].clear(() => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      }),
    area
  );
};

const getDynamicRuleCount = (worker) =>
  worker.evaluate(
    () =>
      new Promise((resolve, reject) => {
        chrome.declarativeNetRequest.getDynamicRules((rules) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(rules.length);
        });
      })
  );

const sendExtensionMessage = async (page, message) =>
  page.evaluate(
    (payload) =>
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      }),
    message
  );

const reblockAllSites = async (controlPage, worker, expectedRuleCount) => {
  const response = await sendExtensionMessage(controlPage, {
    type: "reblock-all-now",
  });
  expect(response).toMatchObject({ ok: true });
  await expect.poll(() => getDynamicRuleCount(worker)).toBe(expectedRuleCount);
};

const getStoredStats = (worker) =>
  worker.evaluate(
    () =>
      new Promise((resolve, reject) => {
        chrome.storage.local.get({ localDailyStats: null }, (items) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(items.localDailyStats);
        });
      })
  );

const waitForBlockPage = async (page, expectedSite) => {
  await page.waitForURL(
    (url) =>
      url.protocol === "chrome-extension:" &&
      url.pathname.endsWith("/pages/block.html") &&
      url.searchParams.get("site") === expectedSite
  );
  await expect(page.locator("#temporarily-allow-btn")).toBeVisible();
};

const openBlockedSite = async (page, url, expectedSite) => {
  await page.goto(url);
  await waitForBlockPage(page, expectedSite);
};

const clickAllowAndWaitForSite = async (page, expectedUrl) => {
  await Promise.all([
    page.waitForURL(expectedUrl),
    page.locator("#temporarily-allow-btn").click(),
  ]);
  await expect(page.getByTestId("local-site")).toBeVisible();
};

test("global increasing delay works in the loaded extension", async ({}, testInfo) => {
  const { server, port } = await startFixtureServer();
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("user-data"),
    {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 720 },
      args: [
        `--disable-extensions-except=${repoRoot}`,
        `--load-extension=${repoRoot}`,
      ],
      ...(recordDemo
        ? {
            recordVideo: {
              dir: testInfo.outputPath("recorded-video"),
              size: { width: 1280, height: 720 },
            },
          }
        : {}),
    }
  );

  let targetPage;
  let targetVideo;
  const tracePath = recordDemo
    ? path.join(demoDir, "global-allow-delay-trace.zip")
    : testInfo.outputPath("trace.zip");

  try {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    const worker = await waitForExtensionServiceWorker(context);
    const extensionId = new URL(worker.url()).host;

    await clearExtensionStorage(worker, "local");
    await setExtensionStorage(worker, "sync", {
      blockedSites: ["127.0.0.1", "localhost"],
      tempAllowMinutes: 1,
      increasingAllowDelayEnabled: true,
      accessGateActionId: "temporary-allow-domain",
      accessEffectIds: [],
      showChatGptPeek: false,
    });

    await expect.poll(() => getDynamicRuleCount(worker)).toBe(2);

    const settingsPage = await context.newPage();
    await settingsPage.goto(
      `chrome-extension://${extensionId}/pages/options.html`
    );
    await expect(
      settingsPage.getByRole("heading", { name: "Temporary Access" })
    ).toBeVisible();

    const beforeAccess = settingsPage.getByRole("region", {
      name: "Entry friction",
    });
    await expect(beforeAccess.getByText("Before access")).toBeVisible();
    await expect(
      beforeAccess.getByText("Increasing wait", { exact: true })
    ).toBeVisible();
    await expect(
      beforeAccess.locator("#increasing-allow-delay-enabled")
    ).toBeChecked();

    const duringAccess = settingsPage.getByRole("region", {
      name: "Access effects",
    });
    await expect(duringAccess.getByText("During access")).toBeVisible();
    await expect(duringAccess.locator(".effect-card")).toHaveCount(2);
    await settingsPage.screenshot({
      path: testInfo.outputPath("access-friction-settings.png"),
      fullPage: true,
    });
    await settingsPage.close();

    const controlPage = await context.newPage();
    await controlPage.goto(
      `chrome-extension://${extensionId}/pages/stats.html`
    );
    targetPage = await context.newPage();
    targetVideo = targetPage.video();

    const firstSiteUrl = `http://127.0.0.1:${port}/first`;
    await openBlockedSite(targetPage, firstSiteUrl, "127.0.0.1");
    await clickAllowAndWaitForSite(targetPage, firstSiteUrl);
    await expect.poll(async () => (await getStoredStats(worker))?.temporaryAllowsToday).toBe(1);

    await reblockAllSites(controlPage, worker, 2);
    await openBlockedSite(targetPage, firstSiteUrl, "127.0.0.1");

    const allowButton = targetPage.locator("#temporarily-allow-btn");
    await allowButton.click();
    await expect(allowButton).toBeDisabled();
    await expect(allowButton).toContainText(
      "Available in 5s · 1 allow today"
    );

    const earlyAttempt = await sendExtensionMessage(targetPage, {
      type: "temporarily-allow-tab",
      url: targetPage.url(),
      scope: "domain",
    });
    expect(earlyAttempt).toMatchObject({
      ok: false,
      waiting: true,
      allowCountToday: 1,
      delaySeconds: 5,
    });
    expect(earlyAttempt.remainingSeconds).toBeGreaterThan(0);
    await expect.poll(() => getDynamicRuleCount(worker)).toBe(2);

    await expect(allowButton).toHaveText("Allow now", { timeout: 7_000 });
    await clickAllowAndWaitForSite(targetPage, firstSiteUrl);
    await expect.poll(async () => (await getStoredStats(worker))?.temporaryAllowsToday).toBe(2);

    await reblockAllSites(controlPage, worker, 2);
    const secondSiteUrl = `http://localhost:${port}/second`;
    await openBlockedSite(targetPage, secondSiteUrl, "localhost");
    await targetPage.locator("#temporarily-allow-btn").click();
    await expect(targetPage.locator("#temporarily-allow-btn")).toContainText(
      "Available in 10s · 2 allows today"
    );

    const resetResponse = await sendExtensionMessage(controlPage, {
      type: "reset-today-local-stats",
    });
    expect(resetResponse).toMatchObject({
      ok: true,
      stats: { temporaryAllowsToday: 0 },
    });

    await targetPage.reload();
    await waitForBlockPage(targetPage, "localhost");
    await clickAllowAndWaitForSite(targetPage, secondSiteUrl);
    await expect.poll(async () => (await getStoredStats(worker))?.temporaryAllowsToday).toBe(1);
  } finally {
    if (recordDemo) {
      await mkdir(demoDir, { recursive: true });
    }
    await context.tracing.stop({ path: tracePath }).catch(() => undefined);
    const videoPath = recordDemo
      ? path.join(demoDir, "global-allow-delay-demo.webm")
      : null;
    const videoSave =
      recordDemo && targetVideo && videoPath
        ? targetVideo.saveAs(videoPath)
        : null;
    await context.close();
    await videoSave;
    if (recordDemo && videoPath) {
      await testInfo.attach("global-allow-delay-demo", {
        path: videoPath,
        contentType: "video/webm",
      });
      await testInfo.attach("global-allow-delay-trace", {
        path: tracePath,
        contentType: "application/zip",
      });
    }
    await closeServer(server);
  }
});
