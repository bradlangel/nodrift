import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/extension",
  outputDir: "test-results/playwright-extension",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  projects: [
    {
      name: "extension-chromium",
    },
  ],
});
