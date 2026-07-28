import assert from "node:assert/strict";

import {
  ensureFirefoxDataCollectionConsent,
  FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS,
} from "../dist/data-collection-consent.js";

const tests = [];
const test = (name, run) => tests.push({ name, run });

const setChrome = ({ rootUrl, permissions }) => {
  globalThis.chrome = {
    runtime: {
      getURL: () => rootUrl,
      lastError: null,
    },
    permissions,
  };
};

test("does not request data collection permissions outside Firefox", async () => {
  let requestCalled = false;
  setChrome({
    rootUrl: "chrome-extension://extension-id/",
    permissions: {
      request: () => {
        requestCalled = true;
      },
    },
  });

  await ensureFirefoxDataCollectionConsent(
    FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS,
    "OpenAI access review"
  );

  assert.equal(requestCalled, false);
});

test("requests only missing Firefox data collection permissions", async () => {
  let requestedDetails = null;
  setChrome({
    rootUrl: "moz-extension://extension-id/",
    permissions: {
      getAll: (callback) =>
        callback({
          data_collection: ["authenticationInfo"],
        }),
      request: (details, callback) => {
        requestedDetails = details;
        callback(true);
      },
    },
  });

  await ensureFirefoxDataCollectionConsent(
    FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS,
    "OpenAI access review"
  );

  assert.deepEqual(requestedDetails, {
    data_collection: ["browsingActivity", "technicalAndInteraction"],
  });
});

test("skips the prompt when Firefox permissions are already granted", async () => {
  let requestCalled = false;
  setChrome({
    rootUrl: "moz-extension://extension-id/",
    permissions: {
      getAll: (callback) =>
        callback({
          data_collection: [
            "authenticationInfo",
            "browsingActivity",
            "technicalAndInteraction",
          ],
        }),
      request: () => {
        requestCalled = true;
      },
    },
  });

  await ensureFirefoxDataCollectionConsent(
    FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS,
    "OpenAI access review"
  );

  assert.equal(requestCalled, false);
});

test("fails closed when Firefox data collection permission is denied", async () => {
  setChrome({
    rootUrl: "moz-extension://extension-id/",
    permissions: {
      getAll: (callback) => callback({ data_collection: [] }),
      request: (_details, callback) => callback(false),
    },
  });

  await assert.rejects(
    ensureFirefoxDataCollectionConsent(
      FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS,
      "OpenAI access review"
    ),
    /did not grant data sharing/
  );
});

test("fails closed when Firefox lacks built-in data controls", async () => {
  setChrome({
    rootUrl: "moz-extension://extension-id/",
    permissions: {
      getAll: (callback) => callback({ permissions: [] }),
    },
  });

  await assert.rejects(
    ensureFirefoxDataCollectionConsent(
      FIREFOX_OPENAI_ACCESS_REVIEW_DATA_COLLECTION_PERMISSIONS,
      "OpenAI access review"
    ),
    /Update Firefox to 142/
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

if (failures > 0) process.exitCode = 1;
