#!/usr/bin/env node

// Runs schedule, scores, and standings updates in sequence.
// Passes --dry-run through to all three scripts when provided.
// Usage: node scripts/updateAll.js [--dry-run]

const { spawnSync } = require("child_process");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");
const scriptsDir = __dirname;

const scripts = [
  "updateSchedule.js",
  "updateScores.js",
  "buildPlayoffBracket.js",
  "updateStandings.js"
];

let allOk = true;

for (const script of scripts) {
  const args = [path.join(scriptsDir, script)];
  if (dryRun) args.push("--dry-run");

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: path.resolve(scriptsDir, "..")
  });

  if (result.status !== 0) {
    console.error(`\n[updateAll] ${script} failed with exit code ${result.status}`);
    allOk = false;
    break;
  }
}

if (!allOk) process.exitCode = 1;
