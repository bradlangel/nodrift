import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";

import { buildManifestForTarget } from "../scripts/package-release.mjs";
import { buildValidationDirectories } from "../scripts/validate-release.mjs";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const readBaseManifest = async () =>
  JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

test("Firefox target manifest uses background scripts and Gecko settings", async () => {
  const previousFirefoxExtensionId = process.env.FIREFOX_EXTENSION_ID;
  delete process.env.FIREFOX_EXTENSION_ID;

  let manifest;
  try {
    manifest = buildManifestForTarget(await readBaseManifest(), "firefox");
  } finally {
    if (previousFirefoxExtensionId === undefined) {
      delete process.env.FIREFOX_EXTENSION_ID;
    } else {
      process.env.FIREFOX_EXTENSION_ID = previousFirefoxExtensionId;
    }
  }

  assert.deepEqual(manifest.background, {
    scripts: ["dist/block.js"],
    type: "module",
  });
  assert.equal(manifest.background.service_worker, undefined);
  assert.equal(manifest.incognito, "spanning");
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(manifest.optional_host_permissions, ["<all_urls>"]);
  assert.equal(
    manifest.browser_specific_settings.gecko.id,
    "nodrift@bradlangel.github.io"
  );
  assert.equal(
    manifest.browser_specific_settings.gecko.strict_min_version,
    "142.0"
  );
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions,
    {
      required: ["none"],
      optional: [
        "authenticationInfo",
        "browsingActivity",
        "technicalAndInteraction",
        "websiteContent",
      ],
    }
  );
});

test("Chrome target manifest preserves service worker shape", async () => {
  const manifest = buildManifestForTarget(await readBaseManifest(), "chrome");

  assert.deepEqual(manifest.background, {
    service_worker: "dist/block.js",
    type: "module",
  });
  assert.equal(manifest.background.scripts, undefined);
  assert.equal(manifest.incognito, "split");
  assert.equal(manifest.browser_specific_settings, undefined);
});

test("release validation keeps stable reload folders across versions", () => {
  assert.deepEqual(
    buildValidationDirectories("/release", "firefox", "1.0.3"),
    {
      versioned: path.join("/release", "validate", "nodrift-firefox-1.0.3"),
      current: path.join("/release", "validate", "nodrift-firefox-current"),
    }
  );
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
