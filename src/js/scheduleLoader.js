// scheduleLoader.js – Commit 3 refinement (remove game_number logic)
// Loads raw leagueSchedule (homeTeam/awayTeam variant) and normalizes.
// Includes preseason (00125...), regular season (00225...), and playoffs (00425...).
// Adds season_stage label and keeps playoff game labels for UI display.

const RAW_SCHEDULE_URL = "data/schedule/nba_schedule_25_26.json";

let _normalizedCache = null;

export async function loadSchedule() {
  if (_normalizedCache) return _normalizedCache;
  const res = await fetch(RAW_SCHEDULE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`[Schedule] HTTP ${res.status} ${res.statusText}`);

  const text = await res.text();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    console.error("[Schedule] Parse error:", e.message);
    console.error("Raw head:", text.slice(0, 400));
    throw new Error("Failed to parse raw schedule JSON");
  }

  const normalized = transformRaw(raw);
  _normalizedCache = normalized;
  return normalized;
}

function transformRaw(raw) {
  const gameDates = raw?.leagueSchedule?.gameDates;
  if (!Array.isArray(gameDates)) {
    throw new Error("Unexpected raw schedule structure (leagueSchedule.gameDates missing)");
  }

  const outGames = [];
  let sawPreseason = false;

  for (const day of gameDates) {
    if (!Array.isArray(day.games)) continue;
    for (const g of day.games) {
      if (!g.gameId) continue;

      const isPreseason = g.gameId.startsWith("00125");
      const isRegular   = g.gameId.startsWith("00225");
      const isPlayoffs  = g.gameId.startsWith("00425") || Number.parseInt(g.seasonStageId, 10) === 4;
      if (!isPreseason && !isRegular && !isPlayoffs) continue;
      if (isPreseason) sawPreseason = true;

      const startUTC = deriveStartUTC(g);
      if (!startUTC) continue;

      const homeBlock = g.homeTeam || g.hTeam || {};
      const awayBlock = g.awayTeam || g.vTeam || {};

      const homeId = parseInt(homeBlock.teamId ?? homeBlock.teamID, 10);
      const awayId = parseInt(awayBlock.teamId ?? awayBlock.teamID, 10);
      const homeTri = homeBlock.teamTricode || homeBlock.triCode;
      const awayTri = awayBlock.teamTricode || awayBlock.triCode;
      const status = normalizeGameStatus(g);
      const homeScore = parseScore(g.homeScore ?? homeBlock.score);
      const awayScore = parseScore(g.awayScore ?? awayBlock.score);
      const tv = pickPrimaryTvBroadcast(g);

      if (!homeId || !awayId || !homeTri || !awayTri) continue;

      outGames.push({
        game_id: g.gameId,
        date_utc: startUTC,
        home_team_id: homeId,
        home_tri: homeTri,
        away_team_id: awayId,
        away_tri: awayTri,
        venue: g.arenaName || null,
        venue_city: g.arenaCity || null,
        season_stage: isPreseason ? "Preseason" : (isPlayoffs ? "Playoffs" : "Regular Season"),
        series_game_number: normalizeSeriesGameNumber(g),
        status,
        homeScore,
        awayScore,
        tv_broadcast: tv.display,
        tv_scope: tv.scope
      });
    }
  }

  outGames.sort((a, b) => {
    const t = a.date_utc.localeCompare(b.date_utc);
    return t !== 0 ? t : a.game_id.localeCompare(b.game_id);
  });

  return {
    league: "NBA",
    season: raw?.leagueSchedule?.seasonYear || "2025-26",
    generated_utc: new Date().toISOString(),
    games: outGames,
    meta: {
      preseason_included: sawPreseason
    }
  };
}

function deriveStartUTC(g) {
  if (isValidISO(g.startTimeUTC)) return normalizeToZ(g.startTimeUTC);
  if (isValidISO(g.gameDateTimeUTC)) return normalizeToZ(g.gameDateTimeUTC);
  const dateUTC = g.gameDateUTC;
  const timeUTC = g.gameTimeUTC;
  if (dateUTC && timeUTC) {
    const datePart = dateUTC.split("T")[0];
    let timePart = timeUTC.includes("T") ? timeUTC.split("T")[1] : timeUTC;
    timePart = timePart.replace(/Z$/i, "");
    if (timePart.length === 5) timePart += ":00";
    return `${datePart}T${timePart}Z`;
  }
  return null;
}

function isValidISO(str) {
  if (!str) return false;
  return !isNaN(Date.parse(str));
}

function normalizeToZ(str) {
  if (!str) return null;
  if (/[Zz]$/.test(str) || /[+\-]\d\d:\d\d$/.test(str)) return str;
  return str + "Z";
}

function normalizeGameStatus(game) {
  const explicit = String(game?.status || "").toLowerCase();
  if (explicit === "final") return "final";
  if (explicit === "scheduled") return "scheduled";
  const text = String(game?.gameStatusText || "").toLowerCase();
  if (game?.gameStatus === 3 || text === "final") return "final";
  return "scheduled";
}

function normalizeSeriesGameNumber(game) {
  const value = String(game?.seriesGameNumber || game?.gameSubLabel || "").trim();
  return value || null;
}

function parseScore(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function pickPrimaryTvBroadcast(game) {
  const b = game?.broadcasters || {};

  const national = firstTvDisplay(b.nationalBroadcasters);
  if (national) return { display: national, scope: "national" };

  const home = firstTvDisplay(b.homeTvBroadcasters);
  if (home) return { display: home, scope: "home" };

  const away = firstTvDisplay(b.awayTvBroadcasters);
  if (away) return { display: away, scope: "away" };

  return { display: null, scope: null };
}

function firstTvDisplay(list) {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (!item) continue;
    const media = String(item.broadcasterMedia || "").toLowerCase();
    if (media && media !== "tv") continue;

    const label = String(item.broadcasterDisplay || item.broadcasterAbbreviation || "").trim();
    if (label) return normalizeBroadcastName(label);
  }
  return null;
}

function normalizeBroadcastName(name) {
  let out = String(name || "").trim();
  if (!out) return "";

  // For multi-station strings, show only the lead station to keep cards clean.
  out = out.split("/")[0].trim();

  // Keep major national channels and short local stations as-is.
  const keepExact = new Set(["ESPN", "ESPN2", "ABC", "NBC", "NBA TV", "KFAA", "TSN", "SN", "MSG", "YES", "KJZZ"]);
  if (keepExact.has(out)) return out;

  // Collapse verbose network families to concise labels.
  if (/^fanduel sports network/i.test(out)) return "FanDuel";
  if (/^fdsn/i.test(out)) return "FanDuel";
  if (/^monumental sports network/i.test(out)) return "Monumental";
  if (/^mnmt2$/i.test(out)) return "Monumental 2";
  if (/^spectrum sportsnet/i.test(out)) return "Spectrum";
  if (/^space city home network/i.test(out)) return "Space City";
  if (/^chicago sports network plus/i.test(out)) return "CHSN+";
  if (/^chicago sports network/i.test(out)) return "CHSN";
  if (/^nbc sports boston/i.test(out)) return "NBC Boston";
  if (/^nbc sports philadelphia/i.test(out)) return "NBC Philly";
  if (/^nbcsba$/i.test(out)) return "NBC Bay Area";
  if (/^nbcsca$/i.test(out)) return "NBC California";

  // Generic cleanup for long names that include hyphenated region tails.
  out = out.replace(/\s+-\s+.*$/, "").trim();
  return out;
}

export function getGamesByDate(schedule) {
  const map = new Map();
  for (const g of schedule.games) {
    const key = new Date(g.date_utc).toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  return map;
}

export function findScheduleDateBounds(schedule) {
  if (!schedule.games.length) return null;
  let min = Infinity, max = -Infinity;
  for (const g of schedule.games) {
    const t = Date.parse(g.date_utc);
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { start: new Date(min), end: new Date(max) };
}
