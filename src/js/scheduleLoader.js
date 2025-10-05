// scheduleLoader.js – Commit 3 refinement (remove game_number logic)
// Loads raw leagueSchedule (homeTeam/awayTeam variant) and normalizes.
// Includes preseason (00125...) and regular season (00225...) only.
// Adds season_stage label. Excludes any game numbering sequence logic now.

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
      if (!isPreseason && !isRegular) continue;
      if (isPreseason) sawPreseason = true;

      const startUTC = deriveStartUTC(g);
      if (!startUTC) continue;

      const homeBlock = g.homeTeam || g.hTeam || {};
      const awayBlock = g.awayTeam || g.vTeam || {};

      const homeId = parseInt(homeBlock.teamId ?? homeBlock.teamID, 10);
      const awayId = parseInt(awayBlock.teamId ?? awayBlock.teamID, 10);
      const homeTri = homeBlock.teamTricode || homeBlock.triCode;
      const awayTri = awayBlock.teamTricode || awayBlock.triCode;

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
        season_stage: isPreseason ? "Preseason" : "Regular Season"
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
