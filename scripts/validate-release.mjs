#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "manifest.json");
const releaseDir = path.join(repoRoot, "release");
const releaseTargets = new Set(["chrome", "firefox"]);

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

const firefoxOptionalProviderDataCollectionPermissions = [
  "authenticationInfo",
  "browsingActivity",
  "technicalAndInteraction",
  "websiteContent",
];

const forbiddenEntryPattern =
  /^(src\/|tests\/|node_modules\/|\.git\/|package(?:-lock)?\.json$|README\.md$|ARCHITECTURE\.md$|MANUAL_QA\.md$|ROADMAP\.md$|CONTRIBUTING\.md$)/;

function fail(message) {
  console.error(`release:validate failed: ${message}`);
  process.exit(1);
}

function readReleaseTarget(args) {
  let target = "chrome";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--target") {
      i += 1;
      target = args[i];
    } else if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length);
    } else if (releaseTargets.has(arg)) {
      target = arg;
    } else {
      fail(`unknown argument: ${arg}`);
    }

    if (!releaseTargets.has(target)) {
      fail(`unsupported release target "${target}"; expected chrome or firefox`);
    }
  }

  return target;
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

function readZipEntry(zipPath, entry) {
  return run("unzip", ["-p", zipPath, entry]);
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

function validateManifest(zipPath, target) {
  const manifest = JSON.parse(readZipEntry(zipPath, "manifest.json"));

  if (target === "firefox") {
    const geckoSettings = manifest.browser_specific_settings?.gecko;
    const dataCollectionPermissions = geckoSettings?.data_collection_permissions;

    if (!Array.isArray(manifest.background?.scripts)) {
      fail("Firefox ZIP manifest must use background.scripts");
    }
    if (manifest.background.service_worker) {
      fail("Firefox ZIP manifest must not include background.service_worker");
    }
    if (!geckoSettings?.id) {
      fail("Firefox ZIP manifest must define browser_specific_settings.gecko.id");
    }
    if (geckoSettings.strict_min_version !== "142.0") {
      fail("Firefox ZIP manifest must set browser_specific_settings.gecko.strict_min_version to 142.0");
    }
    if (!Array.isArray(dataCollectionPermissions?.required)) {
      fail("Firefox ZIP manifest must define data_collection_permissions.required");
    }
    if (
      JSON.stringify(dataCollectionPermissions.required) !==
      JSON.stringify(["none"])
    ) {
      fail("Firefox ZIP manifest must declare no required external data collection for the core blocker");
    }
    if (!Array.isArray(dataCollectionPermissions?.optional)) {
      fail("Firefox ZIP manifest must define data_collection_permissions.optional");
    }
    const optionalPermissions = [...dataCollectionPermissions.optional].sort();
    if (
      JSON.stringify(optionalPermissions) !==
      JSON.stringify([...firefoxOptionalProviderDataCollectionPermissions].sort())
    ) {
      fail("Firefox ZIP manifest optional data collection permissions are incomplete");
    }
    if (manifest.incognito === "split") {
      fail("Firefox ZIP manifest must not use unsupported incognito split mode");
    }
    if (!manifest.optional_host_permissions?.includes("<all_urls>")) {
      fail("Firefox ZIP manifest must allow runtime requests for all-site access");
    }
    return;
  }

  if (manifest.background?.service_worker !== "dist/block.js") {
    fail("Chrome ZIP manifest must use background.service_worker");
  }
  if (manifest.background?.scripts) {
    fail("Chrome ZIP manifest must not include background.scripts");
  }
}

async function main() {
  const target = readReleaseTarget(process.argv.slice(2));
  const releaseVersion = await readReleaseVersion();
  const zipPath = path.join(releaseDir, `nodrift-${target}-${releaseVersion}.zip`);
  const validateDir = path.join(releaseDir, "validate", `nodrift-${target}-${releaseVersion}`);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  run(npmCommand, ["test"], { stdio: "inherit" });
  run(process.execPath, ["scripts/package-release.mjs", "--target", target], { stdio: "inherit" });
  run("unzip", ["-t", zipPath], { stdio: "inherit" });

  const entries = listZipEntries(zipPath);
  validateEntries(entries);
  validateManifest(zipPath, target);

  await rm(validateDir, { recursive: true, force: true });
  await mkdir(validateDir, { recursive: true });
  run("unzip", ["-q", zipPath, "-d", validateDir]);

  console.log("");
  console.log("Release validation ready:");
  console.log(`ZIP: ${path.relative(repoRoot, zipPath)}`);
  console.log(`${target === "firefox" ? "Firefox" : "Chrome"} load folder: ${validateDir}`);
  console.log("");
  if (target === "firefox") {
    console.log("Open about:debugging#/runtime/this-firefox, click Load Temporary Add-on,");
    console.log("and select manifest.json inside the Firefox load folder above.");
  } else {
    console.log("Open chrome://extensions, enable Developer mode, click Load unpacked,");
    console.log("and select the Chrome load folder above.");
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
