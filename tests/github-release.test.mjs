import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";

import {
  buildReleaseArtifactPaths,
  buildReleaseCommand,
  validateExpectedVersion,
} from "../scripts/publish-github-release.mjs";

const tests = [];

const test = (name, run) => {
  tests.push({ name, run });
};

test("GitHub release includes every browser and source artifact", () => {
  const artifactPaths = buildReleaseArtifactPaths("1.0.4", "/release");

  assert.deepEqual(
    artifactPaths.map((artifactPath) => path.basename(artifactPath)),
    [
      "nodrift-chrome-1.0.4.zip",
      "nodrift-firefox-1.0.4.zip",
      "nodrift-firefox-source-1.0.4.zip",
    ]
  );

  const [command, args] = buildReleaseCommand({
    repo: "bradlangel/nodrift",
    tag: "v1.0.4",
    artifactPaths,
    releaseVersion: "1.0.4",
    target: "release-commit",
  });

  assert.equal(command, "gh");
  assert.deepEqual(args.slice(0, 3), ["release", "create", "v1.0.4"]);
  artifactPaths.forEach((artifactPath) => {
    assert.ok(args.includes(artifactPath));
  });
  assert.deepEqual(
    args.slice(args.indexOf("--repo"), args.indexOf("--repo") + 2),
    ["--repo", "bradlangel/nodrift"]
  );
  assert.deepEqual(
    args.slice(args.indexOf("--target"), args.indexOf("--target") + 2),
    ["--target", "release-commit"]
  );
  assert.ok(args.includes("--generate-notes"));
  assert.ok(args.includes("--latest"));
  assert.equal(args.includes("--notes"), false);
  assert.equal(args.includes("--prerelease"), false);
});

test("Prereleases are generated without becoming the latest release", () => {
  const [, args] = buildReleaseCommand({
    repo: "bradlangel/nodrift",
    tag: "v1.0.5-rc.1",
    artifactPaths: buildReleaseArtifactPaths("1.0.5-rc.1", "/release"),
    releaseVersion: "1.0.5-rc.1",
    target: "release-commit",
  });

  assert.ok(args.includes("--prerelease"));
  assert.ok(args.includes("--latest=false"));
  assert.equal(args.includes("--latest"), false);
});

test("Requested release version must exactly match the manifest version", () => {
  assert.doesNotThrow(() => validateExpectedVersion("1.0.4", "1.0.4"));
  assert.throws(
    () => validateExpectedVersion("1.0.5", "1.0.4"),
    /requested version 1\.0\.5 does not match manifest version 1\.0\.4/
  );
});

test("Manual workflow is guarded and preserves every release artifact", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /--expected-version="\$REQUESTED_VERSION"/);
  assert.match(
    workflow,
    /release\/nodrift-chrome-\$\{\{ inputs\.version \}\}\.zip/
  );
  assert.match(
    workflow,
    /release\/nodrift-firefox-\$\{\{ inputs\.version \}\}\.zip/
  );
  assert.match(
    workflow,
    /release\/nodrift-firefox-source-\$\{\{ inputs\.version \}\}\.zip/
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
