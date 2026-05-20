import assert from "node:assert/strict";

import {
  getDnrExtensionRedirectTransformBase,
  isExtensionPageUrl,
} from "../dist/browser-compat.js";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

const setChromeRuntime = ({ id, rootUrl }) => {
  globalThis.chrome = {
    runtime: {
      id,
      getURL: (path = "") => `${rootUrl}${String(path).replace(/^\//, "")}`,
    },
  };
};

test("DNR redirect transform derives Firefox extension scheme and host", () => {
  setChromeRuntime({
    id: "fallback-id",
    rootUrl: "moz-extension://firefox-extension-id/",
  });

  assert.deepEqual(getDnrExtensionRedirectTransformBase(), {
    scheme: "moz-extension",
    host: "firefox-extension-id",
  });
});

test("extension page URL checks accept moz-extension pages only for this extension", () => {
  setChromeRuntime({
    id: "fallback-id",
    rootUrl: "moz-extension://firefox-extension-id/",
  });

  assert.equal(
    isExtensionPageUrl("moz-extension://firefox-extension-id/pages/block.html?rid=1"),
    true
  );
  assert.equal(
    isExtensionPageUrl("moz-extension://other-extension/pages/block.html"),
    false
  );
  assert.equal(
    isExtensionPageUrl("chrome-extension://fallback-id/pages/block.html"),
    false
  );
  assert.equal(isExtensionPageUrl("https://example.com/"), false);
});

test("DNR redirect transform still derives Chrome extension scheme and host", () => {
  setChromeRuntime({
    id: "chrome-extension-id",
    rootUrl: "chrome-extension://chrome-extension-id/",
  });

  assert.deepEqual(getDnrExtensionRedirectTransformBase(), {
    scheme: "chrome-extension",
    host: "chrome-extension-id",
  });
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

delete globalThis.chrome;

if (failures > 0) {
  process.exitCode = 1;
}
