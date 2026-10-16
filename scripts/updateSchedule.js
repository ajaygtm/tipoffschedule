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

  // Read existing file if present, otherwise start from a minimal structure
  let existing = { meta: {}, leagueSchedule: { gameDates: [] } };
  try {
    existing = await readJsonFile(schedulePath);
  } catch (err) {
    console.warn(`No existing schedule file found at ${schedulePath}, starting fresh.`);
  }

  // Fetch incoming schedule from API adapter (balldontlie) by default.
  // If the provider fails or returns no usable data, fall back to the existing schedule
  let incoming;
  try {
    incoming = await getScheduleFromProvider();
    if (!incoming || !incoming.leagueSchedule || !Array.isArray(incoming.leagueSchedule.gameDates) || incoming.leagueSchedule.gameDates.length === 0) {
      console.warn("Provider returned no schedule data; using existing schedule instead.");
      incoming = existing;
    }
  } catch (err) {
    console.warn("Schedule provider failed:", err.message || err, "-- using existing schedule instead.");
    incoming = existing;
  }

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
      source: SOURCE_SCHEDULE_URL || "balldontlie",
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

// Provider adapter: fetch schedule from balldontlie and return a schedule object
async function getScheduleFromProvider() {
  // Default to balldontlie for free/no-auth schedule data
  try {
    return await fetchBalldontlieSchedule();
  } catch (err) {
    console.warn("balldontlie fetch failed, falling back to SOURCE_SCHEDULE_URL if configured:", err.message);
    if (SOURCE_SCHEDULE_URL) {
      // Keep backward compatibility: fetch the original SOURCE_SCHEDULE_URL
      const incoming = await getJson(SOURCE_SCHEDULE_URL);
      return incoming;
    }
    throw err;
  }
}

async function fetchBalldontlieSchedule() {
  // balldontlie seasons use the starting year (e.g., 2025 for 2025-26)
  const startYear = Number(String(CURRENT_SEASON).split("-")[0]);
  if (!Number.isFinite(startYear)) throw new Error("Invalid CURRENT_SEASON for balldontlie adapter");

  // Try multiple candidate years to find the upcoming season data (startYear, startYear+1, startYear-1)
  const candidateYears = [startYear, startYear + 1, startYear - 1];
  let allGames = [];
  let usedYear = null;

  for (const y of candidateYears) {
    try {
      const games = await fetchBalldontlieGamesForYear(y);
      if (Array.isArray(games) && games.length) {
        allGames = games;
        usedYear = y;
        console.log(`balldontlie: found ${games.length} games for season ${y}`);
        break;
      }
      console.log(`balldontlie: no games for season ${y}`);
    } catch (err) {
      console.warn(`balldontlie: fetch for season ${y} failed: ${err.message}`);
    }
  }

  if (!allGames.length) {
    console.warn("balldontlie: no schedule data found for candidate years");
    return { leagueSchedule: { gameDates: [] } };
  }

  // Group games by date (UTC date)
  const byDate = new Map();
  for (const g of allGames) {
    const iso = g && g.date;
    if (!iso) continue;
    const dateKey = toDateKey(iso);
    if (!dateKey) continue;

    const awayAbbr = (g.visitor_team && g.visitor_team.abbreviation) || null;
    const homeAbbr = (g.home_team && g.home_team.abbreviation) || null;

    const gameObj = {
      gameId: `bdl-${g.id}`,
      startTimeUTC: iso,
      // preserve some legacy fields used by other scripts
      gameDateUTC: iso.split("T")[0] ? `${iso.split("T")[0]}T00:00:00Z` : null,
      gameTimeUTC: iso.includes("T") ? iso.split("T")[1].replace(/Z$/, "") : null,
      awayTeam: { teamTricode: awayAbbr, score: g.visitor_team_score },
      homeTeam: { teamTricode: homeAbbr, score: g.home_team_score },
      vTeam: { triCode: awayAbbr },
      hTeam: { triCode: homeAbbr },
      seasonStageId: g.postseason ? 4 : 2
    };

    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(gameObj);
  }

  const gameDates = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, games]) => ({ date: dateKey, games }));

  return { leagueSchedule: { gameDates }, _meta: { provider: 'balldontlie', year: usedYear } };
}

async function fetchBalldontlieGamesForYear(year) {
  const perPage = 100;
  let page = 1;
  let totalPages = 1;
  const allGames = [];

  while (page <= totalPages) {
    const url = `https://www.balldontlie.io/api/v1/games?seasons[]=${year}&per_page=${perPage}&page=${page}`;
    const json = await getJson(url);
    const data = json && json.data ? json.data : json && json.games ? json.games : [];

    if (!Array.isArray(data)) break;
    allGames.push(...data);

    if (json && json.meta && Number.isFinite(json.meta.total_pages)) {
      totalPages = json.meta.total_pages;
    } else {
      if (data.length < perPage) break;
      totalPages = page + 1;
    }

    page += 1;
  }

  return allGames;
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
        reject(new Error(`Fetch failed: HTTP ${statusCode}`));
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
