#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "manifest.json");
const releaseDir = path.join(repoRoot, "release");

const requiredEntries = [
  "manifest.json",
  "pages/block.html",
  "pages/options.html",
  "pages/popup.html",
  "pages/stats.html",
  "dist/",
  "dist/block.js",
  "dist/options.js",
  "dist/popup.js",
  "dist/redirect.js",
  "dist/stats-dashboard.js",
  "dist/stats.js",
];

const forbiddenEntryPattern =
  /^(src\/|tests\/|node_modules\/|\.git\/|package(?:-lock)?\.json$|README\.md$|ARCHITECTURE\.md$|MANUAL_QA\.md$|ROADMAP\.md$|CONTRIBUTING\.md$)/;

function fail(message) {
  console.error(`release:validate failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe",
  });

  if (result.error?.code === "ENOENT") {
    fail(`required command not found: ${command}`);
  }
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    fail(`${command} ${args.join(" ")} exited with status ${result.status}${stderr ? `\n${stderr}` : ""}`);
  }

  return result.stdout;
}

async function readReleaseVersion() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const releaseVersion = manifest.version_name || manifest.version;

  if (typeof releaseVersion !== "string" || releaseVersion.trim() === "") {
    fail("manifest.json must define version_name or version");
  }

  return releaseVersion;
}

function listZipEntries(zipPath) {
  const output = run("unzip", ["-Z1", zipPath]);
  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateEntries(entries) {
  const entrySet = new Set(entries);
  const missingEntries = requiredEntries.filter((entry) => !entrySet.has(entry));
  const forbiddenEntries = entries.filter((entry) => forbiddenEntryPattern.test(entry));

  if (missingEntries.length > 0) {
    fail(`ZIP is missing required runtime entries:\n${missingEntries.join("\n")}`);
  }

  if (forbiddenEntries.length > 0) {
    fail(`ZIP contains repo-only entries:\n${forbiddenEntries.join("\n")}`);
  }
}

async function main() {
  const releaseVersion = await readReleaseVersion();
  const zipPath = path.join(releaseDir, `nodrift-chrome-${releaseVersion}.zip`);
  const validateDir = path.join(releaseDir, "validate", `nodrift-chrome-${releaseVersion}`);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  run(npmCommand, ["run", "release:zip"], { stdio: "inherit" });
  run("unzip", ["-t", zipPath], { stdio: "inherit" });

  const entries = listZipEntries(zipPath);
  validateEntries(entries);

  await rm(validateDir, { recursive: true, force: true });
  await mkdir(validateDir, { recursive: true });
  run("unzip", ["-q", zipPath, "-d", validateDir]);

  console.log("");
  console.log("Release validation ready:");
  console.log(`ZIP: ${path.relative(repoRoot, zipPath)}`);
  console.log(`Chrome load folder: ${validateDir}`);
  console.log("");
  console.log("Open chrome://extensions, enable Developer mode, click Load unpacked,");
  console.log("and select the Chrome load folder above.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
