#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const util = require("util");

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const SCOREBOARD_URL = "http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const SCHEDULE_PATH = path.resolve(__dirname, "../data/schedule/nba_schedule_25_26.json");

const TRI_ALIASES = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  PHO: "PHX",
  WAS: "WSH"
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const rawText = await readFile(SCHEDULE_PATH, "utf8");
  const schedule = JSON.parse(rawText);

  const gameDates = schedule && schedule.leagueSchedule && schedule.leagueSchedule.gameDates;
  if (!Array.isArray(gameDates)) {
    throw new Error("Unexpected schedule structure: leagueSchedule.gameDates missing");
  }

  const todayKey = toDateKey(new Date().toISOString());
  const allGames = [];

  for (const day of gameDates) {
    if (!Array.isArray(day.games)) continue;
    for (const game of day.games) {
      const dateUTC = deriveStartUTC(game);
      if (!dateUTC) continue;
      allGames.push({ game, dateKey: toDateKey(dateUTC) });
    }
  }

  const targetDateKeys = Array.from(
    new Set(allGames.filter(entry => entry.dateKey <= todayKey).map(entry => entry.dateKey))
  ).sort();

  if (!targetDateKeys.length) {
    console.log("No schedule dates eligible for score updates.");
    return;
  }

  const espnFinalMap = new Map();
  for (const dateKey of targetDateKeys) {
    const events = await fetchEspnEvents(dateKey);
    for (const event of events) {
      const parsed = parseFinalEvent(event);
      if (!parsed) continue;
      espnFinalMap.set(parsed.matchKey, parsed);
    }
  }

  let updatedFinalCount = 0;
  let markedScheduledCount = 0;

  for (const { game, dateKey } of allGames) {
    initializeScoreFields(game);

    const awayTri = normalizeTri(readPath(game, ["awayTeam", "teamTricode"]) || readPath(game, ["vTeam", "triCode"]));
    const homeTri = normalizeTri(readPath(game, ["homeTeam", "teamTricode"]) || readPath(game, ["hTeam", "triCode"]));
    if (!awayTri || !homeTri) continue;

    const matchKey = buildMatchKey(dateKey, awayTri, homeTri);
    const finalFromEspn = espnFinalMap.get(matchKey);

    if (finalFromEspn) {
      game.status = "final";
      game.awayScore = finalFromEspn.awayScore;
      game.homeScore = finalFromEspn.homeScore;
      updatedFinalCount += 1;
      continue;
    }

    // Fallback to existing NBA source fields when game is already final.
    if (isSourceFinal(game)) {
      const awayFallback = toInt(readPath(game, ["awayTeam", "score"]));
      const homeFallback = toInt(readPath(game, ["homeTeam", "score"]));
      game.status = "final";
      game.awayScore = Number.isFinite(awayFallback) ? awayFallback : null;
      game.homeScore = Number.isFinite(homeFallback) ? homeFallback : null;
      updatedFinalCount += 1;
    } else {
      game.status = "scheduled";
      game.awayScore = null;
      game.homeScore = null;
      markedScheduledCount += 1;
    }
  }

  schedule.meta = schedule.meta || {};
  schedule.meta.scores_updated_utc = new Date().toISOString();

  if (!dryRun) {
    const nextText = `${JSON.stringify(schedule, null, 2)}\n`;
    await writeFile(SCHEDULE_PATH, nextText, "utf8");
  }

  console.log(`Dates queried: ${targetDateKeys.length}`);
  console.log(`Final games updated: ${updatedFinalCount}`);
  console.log(`Games marked scheduled: ${markedScheduledCount}`);
  console.log(dryRun ? "Dry run complete. No files were written." : `Updated ${SCHEDULE_PATH}`);
}

async function fetchEspnEvents(dateKey) {
  const url = `${SCOREBOARD_URL}?dates=${dateKey}`;
  const json = await getJson(url);
  return Array.isArray(json && json.events) ? json.events : [];
}

function parseFinalEvent(event) {
  const status = readPath(event, ["status", "type"]);
  if (!status || !status.completed) return null;

  const competitions = event && event.competitions;
  const competitors = Array.isArray(competitions) && competitions[0] ? competitions[0].competitors : null;
  if (!Array.isArray(competitors) || competitors.length < 2) return null;

  const away = competitors.find(c => c.homeAway === "away");
  const home = competitors.find(c => c.homeAway === "home");
  if (!away || !home) return null;

  const awayTri = normalizeTri(readPath(away, ["team", "abbreviation"]));
  const homeTri = normalizeTri(readPath(home, ["team", "abbreviation"]));
  const awayScore = toInt(away && away.score);
  const homeScore = toInt(home && home.score);
  const dateKey = toDateKey(event && event.date);

  if (!awayTri || !homeTri || !dateKey) return null;
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;

  return {
    matchKey: buildMatchKey(dateKey, awayTri, homeTri),
    awayScore,
    homeScore
  };
}

function initializeScoreFields(game) {
  if (!("status" in game)) game.status = "scheduled";
  if (!("awayScore" in game)) game.awayScore = null;
  if (!("homeScore" in game)) game.homeScore = null;
}

function buildMatchKey(dateKey, awayTri, homeTri) {
  return `${dateKey}|${awayTri}|${homeTri}`;
}

function normalizeTri(value) {
  if (!value) return null;
  const clean = String(value).trim().toUpperCase();
  return TRI_ALIASES[clean] || clean;
}

function deriveStartUTC(game) {
  if (isValidISO(game && game.startTimeUTC)) return normalizeToZ(game.startTimeUTC);
  if (isValidISO(game && game.gameDateTimeUTC)) return normalizeToZ(game.gameDateTimeUTC);

  const dateUTC = game && game.gameDateUTC;
  const timeUTC = game && game.gameTimeUTC;
  if (dateUTC && timeUTC) {
    const datePart = String(dateUTC).split("T")[0];
    let timePart = String(timeUTC);
    timePart = timePart.includes("T") ? timePart.split("T")[1] : timePart;
    timePart = timePart.replace(/Z$/i, "");
    if (timePart.length === 5) timePart += ":00";
    return `${datePart}T${timePart}Z`;
  }
  return null;
}

function normalizeToZ(value) {
  if (!value) return null;
  if (/[Zz]$/.test(value) || /[+\-]\d\d:\d\d$/.test(value)) return value;
  return `${value}Z`;
}

function isValidISO(value) {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

function isSourceFinal(game) {
  const text = String((game && game.gameStatusText) || "").toLowerCase();
  return (game && game.gameStatus === 3) || text === "final";
}

function toDateKey(isoValue) {
  if (!isoValue) return null;
  const t = Date.parse(isoValue);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : NaN;
}

function readPath(obj, pathParts) {
  let current = obj;
  for (const key of pathParts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function getJson(urlString) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const client = parsed.protocol === "https:" ? https : http;

    const req = client.get(parsed, res => {
      const statusCode = res.statusCode || 0;

      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const redirected = new URL(res.headers.location, parsed).toString();
        res.resume();
        getJson(redirected).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`ESPN fetch failed: HTTP ${statusCode}`));
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
    req.setTimeout(15000, () => {
      req.destroy(new Error("Request timed out"));
    });
  });
}

main().catch(err => {
  console.error("[updateScores]", err.message || err);
  process.exitCode = 1;
});
