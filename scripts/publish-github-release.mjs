#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "manifest.json");
const releaseDir = path.join(repoRoot, "release");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const options = {
  dryRun: false,
  yes: false,
  allowNonMain: false,
  allowDirty: false,
  skipValidate: false,
  repo: null,
};

for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") options.dryRun = true;
  else if (arg === "--yes") options.yes = true;
  else if (arg === "--allow-non-main") options.allowNonMain = true;
  else if (arg === "--allow-dirty") options.allowDirty = true;
  else if (arg === "--skip-validate") options.skipValidate = true;
  else if (arg.startsWith("--repo=")) options.repo = arg.slice("--repo=".length);
  else {
    fail(`unknown argument: ${arg}`);
  }
}

function fail(message) {
  console.error(`release:github failed: ${message}`);
  process.exit(1);
}

function run(command, args, runOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: runOptions.encoding ?? "utf8",
    stdio: runOptions.stdio ?? "pipe",
  });

  if (result.error?.code === "ENOENT") {
    fail(`required command not found: ${command}`);
  }
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0 && !runOptions.allowFailure) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    fail(`${command} ${args.join(" ")} exited with status ${result.status}${stderr ? `\n${stderr}` : ""}`);
  }

  return result;
}

function trimCommandOutput(command, args, runOptions = {}) {
  return run(command, args, runOptions).stdout.trim();
}

function printCommand(command, args) {
  console.log([command, ...args.map((arg) => JSON.stringify(arg))].join(" "));
}

async function readReleaseVersion() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const releaseVersion = manifest.version_name || manifest.version;

  if (typeof releaseVersion !== "string" || releaseVersion.trim() === "") {
    fail("manifest.json must define version_name or version");
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(releaseVersion)) {
    fail(`manifest version is not safe for a tag or filename: ${releaseVersion}`);
  }

  return releaseVersion;
}

function parseRepoFromRemote(remoteUrl) {
  const trimmed = remoteUrl.trim();
  const httpsMatch = trimmed.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!httpsMatch) return null;
  return httpsMatch[1];
}

function getGitHubRepo() {
  if (options.repo) return options.repo;
  const remoteUrl = trimCommandOutput("git", ["remote", "get-url", "origin"]);
  const repo = parseRepoFromRemote(remoteUrl);
  if (!repo) {
    fail(`could not derive GitHub repo from origin remote: ${remoteUrl}`);
  }
  return repo;
}

async function zipExists(zipPath) {
  try {
    await access(zipPath);
    const zipStat = await stat(zipPath);
    return zipStat.isFile();
  } catch {
    return false;
  }
}

async function assertZipExists(zipPath) {
  if (!(await zipExists(zipPath))) {
    fail(`release ZIP does not exist: ${path.relative(repoRoot, zipPath)}`);
  }
}

async function warnIfDryRunZipMissing(zipPath) {
  if (!(await zipExists(zipPath))) {
    console.warn(
      `Dry run: ${path.relative(repoRoot, zipPath)} does not exist yet. ` +
        "A real release:github run creates it through release:validate."
    );
  }
}

function assertCleanWorktree() {
  if (options.allowDirty) return;
  const status = trimCommandOutput("git", ["status", "--porcelain"]);
  if (status) {
    fail("worktree is not clean; commit or stash changes before publishing");
  }
}

function assertMainBranch() {
  if (options.allowNonMain) return;
  const branch = trimCommandOutput("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    fail(`release:github must run from main; current branch is ${branch || "(detached)"}`);
  }
}

function assertLocalTagDoesNotExist(tag) {
  const localTag = run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    allowFailure: true,
  });
  if (localTag.status === 0) {
    fail(`local tag already exists: ${tag}`);
  }
}

function assertRemoteTagDoesNotExist(tag) {
  const remoteTag = run("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], {
    allowFailure: true,
  });
  if (remoteTag.status === 0) {
    fail(`remote tag already exists on origin: ${tag}`);
  }
}

function assertReleaseDoesNotExist(repo, tag) {
  const release = run("gh", ["release", "view", tag, "--repo", repo], {
    allowFailure: true,
  });
  if (release.status === 0) {
    fail(`GitHub Release already exists: ${tag}`);
  }
}

async function confirmPublish(tag, repo, zipPath) {
  if (options.dryRun || options.yes) return;

  const rl = createInterface({ input, output });
  try {
    console.log("");
    console.log(`About to publish ${tag} to ${repo}`);
    console.log(`Artifact: ${path.relative(repoRoot, zipPath)}`);
    const answer = await new Promise((resolve) => {
      rl.question(`Type ${tag} to create the tag and GitHub Release: `, resolve);
    });
    if (answer.trim() !== tag) {
      fail("confirmation did not match the release tag");
    }
  } finally {
    rl.close();
  }
}

function createRelease(repo, tag, zipPath, releaseVersion) {
  const isPrerelease = releaseVersion.includes("-");
  const notes = isPrerelease
    ? `Release candidate for NoDrift ${releaseVersion}.`
    : `NoDrift ${releaseVersion}.`;
  const releaseArgs = [
    "release",
    "create",
    tag,
    zipPath,
    "--repo",
    repo,
    "--title",
    `NoDrift ${tag}`,
    "--notes",
    notes,
  ];

  if (isPrerelease) {
    releaseArgs.push("--prerelease");
  }

  const commands = [
    ["git", ["tag", "-a", tag, "-m", `NoDrift ${tag}`]],
    ["git", ["push", "origin", tag]],
    ["gh", releaseArgs],
  ];

  if (options.dryRun) {
    console.log("Dry run. Would run:");
    commands.forEach(([command, args]) => printCommand(command, args));
    return;
  }

  for (const [command, args] of commands) {
    run(command, args, { stdio: "inherit" });
  }
}

async function main() {
  const releaseVersion = await readReleaseVersion();
  const tag = `v${releaseVersion}`;
  const zipPath = path.join(releaseDir, `nodrift-chrome-${releaseVersion}.zip`);
  const repo = getGitHubRepo();

  assertMainBranch();
  assertCleanWorktree();

  if (!options.skipValidate) {
    if (options.dryRun) {
      console.log("Dry run. Skipping npm run release:validate.");
    } else {
      run(npmCommand, ["run", "release:validate"], { stdio: "inherit" });
    }
  }

  if (options.dryRun) {
    await warnIfDryRunZipMissing(zipPath);
  } else {
    await assertZipExists(zipPath);
  }
  assertLocalTagDoesNotExist(tag);

  if (!options.dryRun) {
    run("gh", ["auth", "status", "--hostname", "github.com"], { stdio: "inherit" });
    assertRemoteTagDoesNotExist(tag);
    assertReleaseDoesNotExist(repo, tag);
  }

  await confirmPublish(tag, repo, zipPath);
  createRelease(repo, tag, zipPath, releaseVersion);

  if (!options.dryRun) {
    console.log(`Published GitHub Release ${tag}: https://github.com/${repo}/releases/tag/${tag}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
