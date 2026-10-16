#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const util = require("util");

const {
  CURRENT_SEASON,
  SOURCE_SCHEDULE_URL,
  getSchedulePath,
  getGameStageId,
  getStageLabel,
  isAllowedStageGame
} = require("./config");

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const schedulePath = getSchedulePath();

  console.log(`Refreshing schedule for ${CURRENT_SEASON}...`);
  const existing = await readJsonFile(schedulePath);
  const incoming = await getJson(SOURCE_SCHEDULE_URL);

  const existingDates = readGameDates(existing);
  const incomingDates = readGameDates(incoming);

  const existingById = buildGameIndex(existingDates);

  let mergedCount = 0;
  let addedCount = 0;
  let skippedUnsupportedStage = 0;

  const nextDates = [];

  for (const incomingDay of incomingDates) {
    const incomingGames = Array.isArray(incomingDay.games) ? incomingDay.games : [];
    const mergedGames = [];

    for (const sourceGame of incomingGames) {
      if (!sourceGame || !sourceGame.gameId) continue;

      if (!isAllowedStageGame(sourceGame)) {
        skippedUnsupportedStage += 1;
        continue;
      }

      const prevGame = existingById.get(sourceGame.gameId);
      const nextGame = mergeGame(prevGame, sourceGame);
      const stageId = getGameStageId(sourceGame);

      nextGame.seasonStageId = stageId;
      nextGame.seasonStageLabel = getStageLabel(stageId);

      if (prevGame) mergedCount += 1;
      else addedCount += 1;

      mergedGames.push(nextGame);
    }

    if (!mergedGames.length) continue;

    nextDates.push({
      ...incomingDay,
      games: mergedGames
    });
  }

  const nextSchedule = {
    ...existing,
    leagueSchedule: {
      ...(existing.leagueSchedule || {}),
      ...(incoming.leagueSchedule || {}),
      gameDates: nextDates
    },
    meta: {
      ...(existing.meta || {}),
      source: SOURCE_SCHEDULE_URL,
      season: CURRENT_SEASON,
      schedule_synced_utc: new Date().toISOString()
    }
  };

  if (!dryRun) {
    const content = `${JSON.stringify(nextSchedule, null, 2)}\n`;
    await writeFile(schedulePath, content, "utf8");
    console.log(`Updated ${schedulePath}`);
  }

  console.log(`Merged existing games: ${mergedCount}`);
  console.log(`Added new games: ${addedCount}`);
  console.log(`Skipped unsupported-stage games: ${skippedUnsupportedStage}`);
  if (dryRun) console.log("Dry run complete. No files written.");
}

function mergeGame(prevGame, sourceGame) {
  const merged = {
    ...(prevGame || {}),
    ...sourceGame
  };

  if (prevGame && Object.prototype.hasOwnProperty.call(prevGame, "status")) {
    merged.status = prevGame.status;
  }
  if (prevGame && Object.prototype.hasOwnProperty.call(prevGame, "awayScore")) {
    merged.awayScore = prevGame.awayScore;
  }
  if (prevGame && Object.prototype.hasOwnProperty.call(prevGame, "homeScore")) {
    merged.homeScore = prevGame.homeScore;
  }

  return merged;
}

function readGameDates(json) {
  const dates = json && json.leagueSchedule && json.leagueSchedule.gameDates;
  if (!Array.isArray(dates)) {
    throw new Error("Unexpected schedule structure: leagueSchedule.gameDates missing");
  }
  return dates;
}

function buildGameIndex(gameDates) {
  const map = new Map();
  for (const day of gameDates) {
    const games = Array.isArray(day && day.games) ? day.games : [];
    for (const game of games) {
      if (!game || !game.gameId) continue;
      map.set(game.gameId, game);
    }
  }
  return map;
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

function getJson(urlString) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const client = parsed.protocol === "https:" ? https : http;

    // Include a browser-like User-Agent and Accept header to avoid CDN 403s
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; tipoffschedule/1.0)",
        "Accept": "application/json"
      }
    };

    const req = client.get(options, res => {
      const statusCode = res.statusCode || 0;

      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const redirected = new URL(res.headers.location, parsed).toString();
        res.resume();
        getJson(redirected).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`Schedule fetch failed: HTTP ${statusCode}`));
        return;
      }

      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${err.message}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

main().catch(err => {
  console.error("[updateSchedule]", err.message || err);
  process.exitCode = 1;
});
