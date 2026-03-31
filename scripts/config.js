const path = require("path");

const CURRENT_SEASON = "2025-26";

const TRI_ALIASES = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  UTAH: "UTA",
  PHO: "PHX",
  WSH: "WAS",
  CHO: "CHA"
};

const SCHEDULE_FILE_BY_SEASON = {
  "2025-26": "nba_schedule_25_26.json"
};

const ALLOWED_STAGE_IDS = new Set([1, 2, 4]);

const STAGE_LABEL_BY_ID = {
  1: "Preseason",
  2: "Regular Season",
  4: "Playoffs"
};

const STAGE_ID_BY_PREFIX = {
  "001": 1,
  "002": 2,
  "004": 4
};

const SOURCE_SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json";

function getSchedulePath() {
  const fileName = SCHEDULE_FILE_BY_SEASON[CURRENT_SEASON];
  if (!fileName) {
    throw new Error(`No schedule file configured for season ${CURRENT_SEASON}`);
  }
  return path.resolve(__dirname, "../data/schedule", fileName);
}

function getGameStageId(game) {
  if (!game || typeof game !== "object") return null;

  const rawSeasonStageId = Number.parseInt(game.seasonStageId, 10);
  if (Number.isFinite(rawSeasonStageId)) return rawSeasonStageId;

  const gameId = String(game.gameId || "");
  if (gameId.length >= 3) {
    const prefix = gameId.slice(0, 3);
    if (prefix in STAGE_ID_BY_PREFIX) return STAGE_ID_BY_PREFIX[prefix];
  }

  return null;
}

function getStageLabel(stageId) {
  const id = Number.parseInt(stageId, 10);
  return STAGE_LABEL_BY_ID[id] || "Unknown";
}

function isAllowedStageGame(game) {
  const stageId = getGameStageId(game);
  return ALLOWED_STAGE_IDS.has(stageId);
}

function normalizeTri(value) {
  if (!value) return null;
  const clean = String(value).trim().toUpperCase();
  return TRI_ALIASES[clean] || clean;
}

module.exports = {
  CURRENT_SEASON,
  SOURCE_SCHEDULE_URL,
  ALLOWED_STAGE_IDS,
  STAGE_LABEL_BY_ID,
  TRI_ALIASES,
  getSchedulePath,
  getGameStageId,
  getStageLabel,
  isAllowedStageGame,
  normalizeTri
};
