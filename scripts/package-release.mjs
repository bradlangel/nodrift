#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const releaseDir = path.join(repoRoot, "release");
const manifestFile = "manifest.json";
const distDir = "dist";
const releaseTargets = new Set(["chrome", "firefox"]);

function fail(message) {
  console.error(`release:zip failed: ${message}`);
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

function buildFirefoxManifest(baseManifest) {
  const manifest = JSON.parse(JSON.stringify(baseManifest));
  const serviceWorker = manifest.background?.service_worker;

  if (typeof serviceWorker !== "string" || serviceWorker.trim() === "") {
    fail("Firefox manifest generation requires background.service_worker in manifest.json");
  }

  manifest.background = {
    scripts: [serviceWorker],
    type: manifest.background?.type || "module",
  };

  if (manifest.incognito === "split") {
    manifest.incognito = "spanning";
  }

  const existingBrowserSettings = manifest.browser_specific_settings ?? {};
  const existingGeckoSettings = existingBrowserSettings.gecko ?? {};
  manifest.browser_specific_settings = {
    ...existingBrowserSettings,
    gecko: {
      ...existingGeckoSettings,
      id:
        process.env.FIREFOX_EXTENSION_ID ||
        existingGeckoSettings.id ||
        "nodrift@bradlangel.github.io",
      strict_min_version: existingGeckoSettings.strict_min_version || "113.0",
    },
  };

  return manifest;
}

function buildManifestForTarget(baseManifest, target) {
  if (target === "firefox") {
    return buildFirefoxManifest(baseManifest);
  }
  return JSON.parse(JSON.stringify(baseManifest));
}

export { buildFirefoxManifest, buildManifestForTarget };

function toPlatformPath(relativePath) {
  return path.join(...relativePath.split("/"));
}

function normalizeManifestPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  if (trimmed.includes("*")) {
    fail(`${label} uses wildcard path "${trimmed}", which must be packaged explicitly`);
  }
  if (trimmed.includes("?") || trimmed.includes("#")) {
    fail(`${label} includes query or hash syntax: "${trimmed}"`);
  }
  if (path.posix.isAbsolute(trimmed)) {
    fail(`${label} must be relative to the extension root: "${trimmed}"`);
  }

  const normalized = path.posix.normalize(trimmed);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    fail(`${label} points outside the extension root: "${trimmed}"`);
  }

  return normalized;
}

function addPath(paths, value, label) {
  const normalized = normalizeManifestPath(value, label);
  if (normalized) {
    paths.add(normalized);
  }
}

function addPathMap(paths, value, label) {
  if (typeof value === "string") {
    addPath(paths, value, label);
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, pathValue] of Object.entries(value)) {
      addPath(paths, pathValue, `${label}.${key}`);
    }
  }
}

function collectManifestReferencedFiles(manifest) {
  const paths = new Set();

  addPath(paths, manifest.background?.service_worker, "background.service_worker");
  for (const [index, scriptFile] of (manifest.background?.scripts ?? []).entries()) {
    addPath(paths, scriptFile, `background.scripts[${index}]`);
  }
  addPath(paths, manifest.action?.default_popup, "action.default_popup");
  addPathMap(paths, manifest.action?.default_icon, "action.default_icon");
  addPath(paths, manifest.options_page, "options_page");
  addPath(paths, manifest.options_ui?.page, "options_ui.page");
  addPathMap(paths, manifest.icons, "icons");
  addPath(paths, manifest.devtools_page, "devtools_page");
  addPath(paths, manifest.side_panel?.default_path, "side_panel.default_path");

  if (manifest.chrome_url_overrides && typeof manifest.chrome_url_overrides === "object") {
    for (const [key, pathValue] of Object.entries(manifest.chrome_url_overrides)) {
      addPath(paths, pathValue, `chrome_url_overrides.${key}`);
    }
  }

  for (const [index, resourceSet] of (manifest.web_accessible_resources ?? []).entries()) {
    for (const resource of resourceSet.resources ?? []) {
      addPath(paths, resource, `web_accessible_resources[${index}].resources`);
    }
  }

  for (const [index, contentScript] of (manifest.content_scripts ?? []).entries()) {
    for (const jsFile of contentScript.js ?? []) {
      addPath(paths, jsFile, `content_scripts[${index}].js`);
    }
    for (const cssFile of contentScript.css ?? []) {
      addPath(paths, cssFile, `content_scripts[${index}].css`);
    }
  }

  for (const [index, ruleResource] of (manifest.declarative_net_request?.rule_resources ?? []).entries()) {
    addPath(paths, ruleResource.path, `declarative_net_request.rule_resources[${index}].path`);
  }

  for (const [index, sandboxPage] of (manifest.sandbox?.pages ?? []).entries()) {
    addPath(paths, sandboxPage, `sandbox.pages[${index}]`);
  }

  addPath(paths, manifest.user_scripts?.api_script, "user_scripts.api_script");

  return paths;
}

async function assertFileExists(relativePath) {
  const absolutePath = path.join(repoRoot, toPlatformPath(relativePath));
  let fileStat;

  try {
    fileStat = await stat(absolutePath);
  } catch {
    fail(`required runtime file is missing: ${relativePath}`);
  }

  if (!fileStat.isFile()) {
    fail(`required runtime path is not a file: ${relativePath}`);
  }
}

async function copyRelativeFile(relativePath, stagingDir) {
  const source = path.join(repoRoot, toPlatformPath(relativePath));
  const destination = path.join(stagingDir, toPlatformPath(relativePath));
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function getRootRuntimeFiles() {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".html") || name.endsWith(".js"))
    .sort();
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
  const target = readReleaseTarget(process.argv.slice(2));
  const baseManifest = JSON.parse(await readFile(path.join(repoRoot, manifestFile), "utf8"));
  const manifest = buildManifestForTarget(baseManifest, target);
  const releaseVersion = manifest.version_name || manifest.version;

  if (typeof releaseVersion !== "string" || releaseVersion.trim() === "") {
    fail("manifest.json must define version_name or version");
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(releaseVersion)) {
    fail(`manifest version is not safe for a filename: ${releaseVersion}`);
  }

  const manifestReferences = collectManifestReferencedFiles(manifest);
  for (const relativePath of manifestReferences) {
    await assertFileExists(relativePath);
  }

  const distPath = path.join(repoRoot, distDir);
  let distStat;
  try {
    distStat = await stat(distPath);
  } catch {
    fail("compiled dist/ directory is missing; run npm run build first");
  }
  if (!distStat.isDirectory()) {
    fail("dist/ exists but is not a directory");
  }

  const rootRuntimeFiles = await getRootRuntimeFiles();
  const rootRuntimeSet = new Set([manifestFile, ...rootRuntimeFiles]);
  const extraManifestFiles = [...manifestReferences]
    .filter((relativePath) => !rootRuntimeSet.has(relativePath))
    .filter((relativePath) => !relativePath.startsWith(`${distDir}/`))
    .sort();

  await mkdir(releaseDir, { recursive: true });

  const zipFileName = `nodrift-${target}-${releaseVersion}.zip`;
  const zipPath = path.join(releaseDir, zipFileName);
  await rm(zipPath, { force: true });

  const stagingDir = await mkdtemp(path.join(tmpdir(), "nodrift-release-"));

  try {
    await writeFile(
      path.join(stagingDir, manifestFile),
      `${JSON.stringify(manifest, null, 2)}\n`
    );

    for (const relativePath of [...rootRuntimeFiles, ...extraManifestFiles]) {
      await copyRelativeFile(relativePath, stagingDir);
    }
    await cp(distPath, path.join(stagingDir, distDir), { recursive: true });

    const topLevelEntries = (await readdir(stagingDir)).sort();
    runZip(stagingDir, zipPath, topLevelEntries);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }

  console.log(`Created ${path.relative(repoRoot, zipPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
