#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const util = require("util");

const { getSchedulePath, normalizeTri } = require("./config");

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const OUTPUT_PATH = path.resolve(__dirname, "../data/playoffs_bracket.json");

const EXPECTED_BRACKET = {
  east: {
    name: "Eastern Conference",
    finalsSeriesId: "0030",
    connectors: [
      ["0010", "0020"],
      ["0013", "0020"],
      ["0011", "0021"],
      ["0012", "0021"],
      ["0020", "0030"],
      ["0021", "0030"]
    ],
    rounds: [
      {
        key: "first-round",
        title: "First Round",
        series: [
          { id: "0010", matchupTitle: "1 vs 8", seeds: [1, 8], feeder: [] },
          { id: "0013", matchupTitle: "4 vs 5", seeds: [4, 5], feeder: [] },
          { id: "0011", matchupTitle: "2 vs 7", seeds: [2, 7], feeder: [] },
          { id: "0012", matchupTitle: "3 vs 6", seeds: [3, 6], feeder: [] }
        ]
      },
      {
        key: "conference-semis",
        title: "Conference Semis",
        series: [
          { id: "0020", matchupTitle: "Semifinal A", feeder: ["0010", "0013"] },
          { id: "0021", matchupTitle: "Semifinal B", feeder: ["0011", "0012"] }
        ]
      },
      {
        key: "conference-finals",
        title: "Conference Finals",
        series: [
          { id: "0030", matchupTitle: "East Finals", feeder: ["0020", "0021"] }
        ]
      }
    ]
  },
  west: {
    name: "Western Conference",
    finalsSeriesId: "0031",
    connectors: [
      ["0014", "0022"],
      ["0017", "0022"],
      ["0015", "0023"],
      ["0016", "0023"],
      ["0022", "0031"],
      ["0023", "0031"]
    ],
    rounds: [
      {
        key: "first-round",
        title: "First Round",
        series: [
          { id: "0014", matchupTitle: "1 vs 8", seeds: [1, 8], feeder: [] },
          { id: "0017", matchupTitle: "4 vs 5", seeds: [4, 5], feeder: [] },
          { id: "0015", matchupTitle: "2 vs 7", seeds: [2, 7], feeder: [] },
          { id: "0016", matchupTitle: "3 vs 6", seeds: [3, 6], feeder: [] }
        ]
      },
      {
        key: "conference-semis",
        title: "Conference Semis",
        series: [
          { id: "0022", matchupTitle: "Semifinal A", feeder: ["0014", "0017"] },
          { id: "0023", matchupTitle: "Semifinal B", feeder: ["0015", "0016"] }
        ]
      },
      {
        key: "conference-finals",
        title: "Conference Finals",
        series: [
          { id: "0031", matchupTitle: "West Finals", feeder: ["0022", "0023"] }
        ]
      }
    ]
  },
  finals: {
    id: "0040",
    key: "nba-finals",
    title: "NBA Finals",
    matchupTitle: "Championship",
    feeder: ["0030", "0031"]
  }
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const schedulePath = getSchedulePath();
  const schedule = JSON.parse(await readFile(schedulePath, "utf8"));

  const actualSeriesMap = collectActualSeries(schedule);
  const built = buildBracketPayload(actualSeriesMap, schedule);
  const content = JSON.stringify(built, null, 2) + "\n";

  if (!dryRun) {
    await writeFile(OUTPUT_PATH, content, "utf8");
    console.log("Updated " + OUTPUT_PATH);
  }

  console.log("Playoff series processed: " + actualSeriesMap.size);
  if (dryRun) console.log("Dry run complete. No files written.");
}

function buildBracketPayload(actualSeriesMap, schedule) {
  const seriesLookup = new Map();

  const conferences = {};
  for (let confIdx = 0; confIdx < 2; confIdx++) {
    const conferenceKey = confIdx === 0 ? "east" : "west";
    const conferenceConfig = EXPECTED_BRACKET[conferenceKey];
    const rounds = conferenceConfig.rounds.map(function(round) {
      const series = round.series.map(function(def) {
        const builtSeries = buildSeries(def, round.key, conferenceKey, actualSeriesMap, seriesLookup);
        seriesLookup.set(def.id, builtSeries);
        return builtSeries;
      });

      return {
        key: round.key,
        title: round.title,
        series: series
      };
    });

    conferences[conferenceKey] = {
      key: conferenceKey,
      name: conferenceConfig.name,
      finalsSeriesId: conferenceConfig.finalsSeriesId,
      connectors: conferenceConfig.connectors,
      rounds: rounds
    };
  }

  const finals = buildSeries(
    EXPECTED_BRACKET.finals,
    EXPECTED_BRACKET.finals.key,
    "finals",
    actualSeriesMap,
    seriesLookup
  );
  seriesLookup.set(EXPECTED_BRACKET.finals.id, finals);

  const scheduleMeta = schedule && schedule.meta ? schedule.meta : {};
  return {
    generated_utc: new Date().toISOString(),
    source_schedule_updated_utc: scheduleMeta.schedule_synced_utc || null,
    source_scores_updated_utc: scheduleMeta.scores_updated_utc || null,
    conferences: conferences,
    finals: finals
  };
}

function buildSeries(definition, roundKey, conferenceKey, actualSeriesMap, seriesLookup) {
  const actual = actualSeriesMap.get(definition.id) || null;
  const participants = buildParticipants(definition, actual, seriesLookup, roundKey, conferenceKey);
  const score = actual ? actual.score : { top: 0, bottom: 0 };
  const winnerPosition = actual ? actual.winnerPosition : null;
  const games = actual ? actual.games : [];
  const nextGame = actual ? actual.nextGame : null;
  const seriesText = actual ? actual.seriesText : buildDerivedSeriesText(participants, score, winnerPosition);

  const actualLabel = actual && actual.label ? actual.label : null;
  const label = actualLabel || inferSeriesLabel(roundKey, conferenceKey);

  return {
    id: definition.id,
    roundKey: roundKey,
    conference: conferenceKey,
    title: definition.matchupTitle,
    label: label,
    feederSeriesIds: definition.feeder || [],
    participants: participants,
    score: score,
    winnerPosition: winnerPosition,
    nextGame: nextGame,
    games: games,
    seriesText: seriesText,
    status: determineSeriesStatus(games, winnerPosition),
    seeds: definition.seeds || null
  };
}

function buildParticipants(definition, actual, seriesLookup, roundKey, conferenceKey) {
  if (actual && actual.participants && actual.participants.length === 2) {
    const aligned = alignParticipants(definition, actual.participants, conferenceKey, roundKey);
    if (aligned) return aligned;
  }

  if (roundKey === "first-round") {
    const seeds = definition.seeds || [null, null];
    const actualP = actual && actual.participants ? actual.participants : [];
    const top = actualP[0] || createSeedPlaceholder(seeds[0]);
    const bottom = actualP[1] || createSeedPlaceholder(seeds[1]);
    return [
      fillMissingParticipant(top, seeds[0]),
      fillMissingParticipant(bottom, seeds[1])
    ];
  }

  return (definition.feeder || []).map(function(seriesId, index) {
    const feeder = seriesLookup.get(seriesId);
    if (!feeder) {
      return createNamedPlaceholder("Winner TBD");
    }

    const winner = feeder.winnerPosition ? feeder.participants[feeder.winnerPosition === "top" ? 0 : 1] : null;
    if (winner && !winner.placeholder) {
      return Object.assign({}, winner);
    }

    return createNamedPlaceholder(placeholderLabelFromSeries(feeder));
  });
}

function alignParticipants(definition, participants, conferenceKey, roundKey) {
  const cleaned = participants.map(function(p) { return Object.assign({}, p); });
  if (cleaned.length !== 2) return null;

  if (roundKey === "first-round" && definition.seeds) {
    const seedA = definition.seeds[0];
    const seedB = definition.seeds[1];
    const bySeedA = cleaned.find(function(p) { return p.seed === seedA; }) || cleaned[0];
    const bySeedB = cleaned.find(function(p) { return p.seed === seedB; }) || cleaned.find(function(p) { return p !== bySeedA; }) || cleaned[1];
    return [fillMissingParticipant(bySeedA, seedA), fillMissingParticipant(bySeedB, seedB)];
  }

  if (conferenceKey === "finals") {
    const eastParticipant = cleaned.find(function(p) { return p.conferenceHint === "east"; }) || cleaned[0];
    const westParticipant = cleaned.find(function(p) { return p.conferenceHint === "west"; }) || cleaned.find(function(p) { return p !== eastParticipant; }) || cleaned[1];
    return [eastParticipant, westParticipant];
  }

  return cleaned;
}

function collectActualSeries(schedule) {
  const leagueSchedule = schedule && schedule.leagueSchedule ? schedule.leagueSchedule : {};
  const gameDates = leagueSchedule.gameDates;
  if (!Array.isArray(gameDates)) {
    throw new Error("Unexpected schedule structure: leagueSchedule.gameDates missing");
  }

  const bySeriesId = new Map();

  for (let d = 0; d < gameDates.length; d++) {
    const day = gameDates[d];
    if (!Array.isArray(day.games)) continue;

    for (let g = 0; g < day.games.length; g++) {
      const game = day.games[g];
      const stageId = game && game.seasonStageId ? Number.parseInt(String(game.seasonStageId), 10) : -1;
      if (stageId !== 4) continue;
      
      const gameId = game && game.gameId ? String(game.gameId).trim() : "";
      if (!gameId.startsWith("00425") || gameId.length < 9) continue;

      const seriesId = gameId.slice(5, 9);
      const entry = bySeriesId.get(seriesId) || createActualSeries(seriesId, game);
      entry.games.push(normalizePlayoffGame(game));
      mergeParticipantIntoSeries(entry, normalizeTeam(game && game.homeTeam ? game.homeTeam : null, inferConferenceHint(seriesId, game && game.gameLabel ? game.gameLabel : "")));
      mergeParticipantIntoSeries(entry, normalizeTeam(game && game.awayTeam ? game.awayTeam : null, inferConferenceHint(seriesId, game && game.gameLabel ? game.gameLabel : "")));
      if (game && game.seriesText) entry.seriesText = String(game.seriesText).trim();
      if (game && game.gameLabel) entry.label = String(game.gameLabel).trim();
      bySeriesId.set(seriesId, entry);
    }
  }

  for (const entry of bySeriesId.values()) {
    finalizeActualSeries(entry);
  }

  return bySeriesId;
}

function createActualSeries(seriesId, game) {
  const gameLabel = game && game.gameLabel ? String(game.gameLabel) : "";
  const gameSeriesText = game && game.seriesText ? String(game.seriesText) : "";
  return {
    id: seriesId,
    label: gameLabel.trim(),
    seriesText: gameSeriesText.trim(),
    participants: [],
    games: [],
    score: { top: 0, bottom: 0 },
    winnerPosition: null,
    nextGame: null
  };
}

function mergeParticipantIntoSeries(series, participant) {
  if (!participant) return;
  const existing = series.participants.find(function(candidate) {
    if (participant.tri && candidate.tri) return candidate.tri === participant.tri;
    return !candidate.tri && !participant.tri && candidate.seed === participant.seed;
  });

  if (existing) {
    if (!existing.name && participant.name) existing.name = participant.name;
    if (!existing.shortName && participant.shortName) existing.shortName = participant.shortName;
    if (!existing.seed && participant.seed) existing.seed = participant.seed;
    if (!existing.conferenceHint && participant.conferenceHint) existing.conferenceHint = participant.conferenceHint;
    existing.placeholder = existing.placeholder && participant.placeholder;
    return;
  }

  series.participants.push(participant);
}

function finalizeActualSeries(series) {
  series.games.sort(function(left, right) {
    const numberDiff = (left.gameNumber || 0) - (right.gameNumber || 0);
    if (numberDiff !== 0) return numberDiff;
    return String(left.date_utc || "").localeCompare(String(right.date_utc || ""));
  });

  series.participants.sort(function(left, right) {
    const seedLeft = Number.isFinite(left.seed) ? left.seed : 99;
    const seedRight = Number.isFinite(right.seed) ? right.seed : 99;
    if (seedLeft !== seedRight) return seedLeft - seedRight;
    return String(left.tri || left.name || "").localeCompare(String(right.tri || right.name || ""));
  });

  const winsByTri = new Map();
  for (let i = 0; i < series.games.length; i++) {
    const game = series.games[i];
    if (game.status !== "final") continue;
    const homeScore = toFiniteNumber(game.homeScore);
    const awayScore = toFiniteNumber(game.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    const winnerTri = homeScore > awayScore ? (game.home && game.home.tri ? game.home.tri : null) : (awayScore > homeScore ? (game.away && game.away.tri ? game.away.tri : null) : null);
    if (!winnerTri) continue;
    winsByTri.set(winnerTri, (winsByTri.get(winnerTri) || 0) + 1);
  }

  if (series.participants[0] && series.participants[0].tri) {
    series.score.top = winsByTri.get(series.participants[0].tri) || 0;
  }
  if (series.participants[1] && series.participants[1].tri) {
    series.score.bottom = winsByTri.get(series.participants[1].tri) || 0;
  }

  if (series.score.top >= 4) series.winnerPosition = "top";
  if (series.score.bottom >= 4) series.winnerPosition = "bottom";

  const upcoming = series.games.filter(function(game) { return game.status !== "final"; });
  series.nextGame = upcoming.length ? upcoming[0] : null;
}

function normalizePlayoffGame(game) {
  const gameId = game && game.gameId ? String(game.gameId) : "";
  const gameSubLabel = game && game.gameSubLabel ? String(game.gameSubLabel) : "";
  const seriesGameNumber = game && game.seriesGameNumber ? game.seriesGameNumber : "";
  const status = game && game.status ? String(game.status).toLowerCase() : "scheduled";
  const gameStatusText = game && game.gameStatusText ? String(game.gameStatusText) : "";
  const ifNecessary = game && game.ifNecessary ? String(game.ifNecessary).toLowerCase() === "true" : false;
  const broadcasters = game && game.broadcasters ? game.broadcasters : null;
  const homeTeam = game && game.homeTeam ? game.homeTeam : null;
  const awayTeam = game && game.awayTeam ? game.awayTeam : null;
  const homeScore = game && game.homeScore ? game.homeScore : null;
  const awayScore = game && game.awayScore ? game.awayScore : null;
  
  return {
    id: gameId,
    gameNumber: parseGameNumber(seriesGameNumber || gameSubLabel),
    label: (gameSubLabel || seriesGameNumber || "").trim() || null,
    status: status,
    statusText: gameStatusText.trim() || null,
    ifNecessary: ifNecessary,
    date_utc: deriveStartUTC(game),
    tv: normalizeBroadcastLabel(broadcasters),
    home: normalizeTeam(homeTeam, null),
    away: normalizeTeam(awayTeam, null),
    homeScore: nullableInteger(homeScore),
    awayScore: nullableInteger(awayScore)
  };
}

function normalizeTeam(team, conferenceHint) {
  const teamTricode = team && team.teamTricode ? team.teamTricode : "";
  const seed = team && team.seed ? team.seed : null;
  const teamCity = team && team.teamCity ? String(team.teamCity) : "";
  const teamName = team && team.teamName ? String(team.teamName) : "";
  
  const tri = normalizeTri(teamTricode);
  const seedNum = nullableInteger(seed);
  const city = teamCity.trim();
  const nickname = teamName.trim();
  const fullName = [city, nickname].filter(function(x) { return x; }).join(" ").trim();

  if (!tri && !fullName && !Number.isFinite(seedNum)) return null;

  return {
    tri: tri || null,
    seed: Number.isFinite(seedNum) && seedNum > 0 ? seedNum : null,
    name: fullName || tri || "TBD",
    shortName: nickname || tri || "TBD",
    placeholder: !tri,
    conferenceHint: conferenceHint || null
  };
}

function createSeedPlaceholder(seed) {
  return {
    tri: null,
    seed: seed || null,
    name: seed ? ("Seed " + seed) : "TBD",
    shortName: seed ? ("#" + seed) : "TBD",
    placeholder: true,
    conferenceHint: null,
    placeholderLabel: seed ? ("Winner #" + seed) : "TBD"
  };
}

function fillMissingParticipant(participant, seed) {
  const tri = participant && participant.tri ? participant.tri : null;
  const pseed = participant && participant.seed ? participant.seed : seed;
  const pname = participant && participant.name ? participant.name : (seed ? ("Seed " + seed) : "TBD");
  const pshortName = participant && participant.shortName ? participant.shortName : (participant && participant.tri ? participant.tri : (seed ? ("#" + seed) : "TBD"));
  const pplaceholder = participant && participant.placeholder !== false;
  const pconferenceHint = participant && participant.conferenceHint ? participant.conferenceHint : null;
  const placeholderLabel = participant && participant.placeholderLabel ? participant.placeholderLabel : (seed ? ("Seed " + seed) : "TBD");

  return {
    tri: tri,
    seed: pseed,
    name: pname,
    shortName: pshortName,
    placeholder: pplaceholder,
    conferenceHint: pconferenceHint,
    placeholderLabel: placeholderLabel
  };
}

function createNamedPlaceholder(label) {
  return {
    tri: null,
    seed: null,
    name: label,
    shortName: label,
    placeholder: true,
    conferenceHint: null,
    placeholderLabel: label
  };
}

function placeholderLabelFromSeries(series) {
  if (series.seeds && Array.isArray(series.seeds)) {
    return "Winner " + series.seeds[0] + " vs " + series.seeds[1];
  }
  return "Winner " + series.title;
}

function inferSeriesLabel(roundKey, conferenceKey) {
  if (roundKey === "first-round") return conferenceKey === "east" ? "East First Round" : "West First Round";
  if (roundKey === "conference-semis") return conferenceKey === "east" ? "East Semifinals" : "West Semifinals";
  if (roundKey === "conference-finals") return conferenceKey === "east" ? "Eastern Conference Finals" : "Western Conference Finals";
  return "NBA Finals";
}

function buildDerivedSeriesText(participants, score, winnerPosition) {
  if (winnerPosition) {
    const winner = winnerPosition === "top" ? participants[0] : participants[1];
    return (winner.shortName || winner.name) + " won " + score.top + "-" + score.bottom;
  }

  if ((score.top || 0) === 0 && (score.bottom || 0) === 0) {
    return "Series tied 0-0";
  }

  if (score.top === score.bottom) {
    return "Series tied " + score.top + "-" + score.bottom;
  }

  const leader = score.top > score.bottom ? participants[0] : participants[1];
  const leaderWins = Math.max(score.top, score.bottom);
  const trailerWins = Math.min(score.top, score.bottom);
  return (leader.shortName || leader.name) + " lead " + leaderWins + "-" + trailerWins;
}

function determineSeriesStatus(games, winnerPosition) {
  if (winnerPosition) return "completed";
  if (games.some(function(g) { return g.status === "final"; })) return "in-progress";
  if (games.some(function(g) { return g.status !== "final"; })) return "upcoming";
  return "tbd";
}

function inferConferenceHint(seriesId, label) {
  if (String(label || "").startsWith("East")) return "east";
  if (String(label || "").startsWith("West")) return "west";
  const numeric = Number.parseInt(seriesId, 10);
  if (numeric >= 10 && numeric <= 13) return "east";
  if (numeric >= 14 && numeric <= 17) return "west";
  if (numeric >= 20 && numeric <= 21) return "east";
  if (numeric >= 22 && numeric <= 23) return "west";
  if (numeric === 30) return "east";
  if (numeric === 31) return "west";
  return null;
}

function deriveStartUTC(game) {
  const startTimeUTC = game && game.startTimeUTC ? game.startTimeUTC : null;
  const gameDateTimeUTC = game && game.gameDateTimeUTC ? game.gameDateTimeUTC : null;
  const gameDateTimeEst = game && game.gameDateTimeEst ? game.gameDateTimeEst : null;
  
  if (isValidISO(startTimeUTC)) return normalizeToZ(startTimeUTC);
  if (isValidISO(gameDateTimeUTC)) return normalizeToZ(gameDateTimeUTC);
  if (isValidISO(gameDateTimeEst)) return normalizeToZ(gameDateTimeEst);

  const dateUTC = game && game.gameDateUTC ? game.gameDateUTC : null;
  const timeUTC = game && game.gameTimeUTC ? game.gameTimeUTC : null;
  if (dateUTC && timeUTC) {
    const datePart = String(dateUTC).split("T")[0];
    let timePart = String(timeUTC);
    timePart = timePart.indexOf("T") >= 0 ? timePart.split("T")[1] : timePart;
    timePart = timePart.replace(/Z$/i, "");
    if (timePart.length === 5) timePart += ":00";
    return datePart + "T" + timePart + "Z";
  }
  return null;
}

function normalizeBroadcastLabel(broadcasters) {
  const national = broadcasters && Array.isArray(broadcasters.nationalBroadcasters) ? broadcasters.nationalBroadcasters : [];
  const firstTv = national.find(function(item) { return String(item && item.broadcasterMedia ? item.broadcasterMedia : "").toLowerCase() === "tv"; });
  const label = firstTv ? String((firstTv.broadcasterDisplay || firstTv.broadcasterAbbreviation || "")).trim() : "";
  return label || null;
}

function parseGameNumber(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function nullableInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFiniteNumber(value) {
  return Number.isFinite(value) ? value : Number.parseInt(value, 10);
}

function isValidISO(value) {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

function normalizeToZ(value) {
  if (!value) return null;
  if (/[Zz]$/.test(value) || /[+\-]\d\d:\d\d$/.test(value)) return value;
  return value + "Z";
}

main().catch(function(err) {
  console.error("[buildPlayoffBracket]", err.message || err);
  process.exitCode = 1;
});