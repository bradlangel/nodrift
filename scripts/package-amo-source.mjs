#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const releaseDir = path.join(repoRoot, "release");
const manifestPath = path.join(repoRoot, "manifest.json");

const sourceEntries = [
  ".gitignore",
  ".nvmrc",
  "AMO_SUBMISSION.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "MANUAL_QA.md",
  "PRIVACY.md",
  "README.md",
  "ROADMAP.md",
  "assets",
  "manifest.json",
  "package-lock.json",
  "package.json",
  "pages",
  "playwright.config.mjs",
  "scripts",
  "src",
  "tests",
  "tsconfig.json",
];

function fail(message) {
  console.error(`release:source:firefox failed: ${message}`);
  process.exit(1);
}

async function readReleaseVersion() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const releaseVersion = manifest.version_name || manifest.version;

  if (typeof releaseVersion !== "string" || releaseVersion.trim() === "") {
    fail("manifest.json must define version_name or version");
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(releaseVersion)) {
    fail(`manifest version is not safe for a filename: ${releaseVersion}`);
  }

  return releaseVersion;
}

function reviewerReadme(releaseVersion) {
  return `# NoDrift Firefox AMO Source Review

This source archive matches NoDrift ${releaseVersion}.

## Build Environment

- Node.js: use the version in .nvmrc
- npm: use the npm version bundled with that Node.js release
- OS: macOS/Linux shell commands are expected; Mozilla's default Ubuntu reviewer environment is supported

## Reproduce The Submitted Firefox ZIP

Run these commands from the root of this source archive:

\`\`\`sh
nvm use
npm ci
npm run release:zip:firefox
\`\`\`

The generated extension package is:

\`\`\`text
release/nodrift-firefox-${releaseVersion}.zip
\`\`\`

For the fuller local confidence path, run:

\`\`\`sh
npm run release:validate:firefox
\`\`\`

NoDrift uses TypeScript compiled by \`tsc\`. It does not use a bundler, minifier,
remote build step, or generated runtime code outside the scripts in this source
archive.
`;
}

async function copyEntry(relativePath, stagingDir) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(stagingDir, relativePath);
  let sourceStat;

  try {
    sourceStat = await stat(source);
  } catch {
    fail(`source package entry is missing: ${relativePath}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });

  if (sourceStat.isDirectory()) {
    await cp(source, destination, {
      recursive: true,
      filter: (entry) => {
        const relativeEntry = path.relative(repoRoot, entry);
        return (
          !relativeEntry.startsWith("dist") &&
          !relativeEntry.startsWith("release") &&
          !relativeEntry.startsWith("node_modules") &&
          !relativeEntry.includes(`${path.sep}.DS_Store`)
        );
      },
    });
    return;
  }

  if (!sourceStat.isFile()) {
    fail(`source package entry is neither a file nor directory: ${relativePath}`);
  }

  await copyFile(source, destination);
}

function runZip(stagingDir, zipPath, topLevelEntries) {
  const result = spawnSync("zip", ["-X", "-r", zipPath, ...topLevelEntries], {
    cwd: stagingDir,
    stdio: "inherit",
  });

  if (result.error?.code === "ENOENT") {
    fail("the `zip` command is required but was not found");
  }
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    fail(`zip exited with status ${result.status}`);
  }
}

async function main() {
  const releaseVersion = await readReleaseVersion();
  await mkdir(releaseDir, { recursive: true });

  const zipPath = path.join(
    releaseDir,
    `nodrift-firefox-source-${releaseVersion}.zip`
  );
  await rm(zipPath, { force: true });

  const stagingDir = await mkdtemp(path.join(tmpdir(), "nodrift-amo-source-"));

  try {
    for (const entry of sourceEntries) {
      await copyEntry(entry, stagingDir);
    }
    await writeFile(
      path.join(stagingDir, "AMO_SOURCE_REVIEW.md"),
      reviewerReadme(releaseVersion)
    );

    const topLevelEntries = (await readdir(stagingDir)).sort();
    runZip(stagingDir, zipPath, topLevelEntries);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }

  console.log(`Created ${path.relative(repoRoot, zipPath)}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
