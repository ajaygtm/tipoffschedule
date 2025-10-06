// teamView.js
// Helper utilities for Team Grid / Calendar

import { TEAM_PRIMARY_COLORS } from "./teamColors.js";

export function buildTeamIndexes(schedule) {
  // gamesByTeam: tri -> array of games (sorted by date)
  const gamesByTeam = new Map();
  if (!schedule?.games) return { gamesByTeam, seasonStart: null, seasonEnd: null };

  let minT = Infinity;
  let maxT = -Infinity;

  for (const g of schedule.games) {
    const t = Date.parse(g.date_utc);
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;

    const triHome = g.home_tri;
    const triAway = g.away_tri;

    if (!gamesByTeam.has(triHome)) gamesByTeam.set(triHome, []);
    if (!gamesByTeam.has(triAway)) gamesByTeam.set(triAway, []);
    gamesByTeam.get(triHome).push(g);
    gamesByTeam.get(triAway).push(g);
  }

  // Sort arrays by date
  for (const arr of gamesByTeam.values()) {
    arr.sort((a, b) => a.date_utc.localeCompare(b.date_utc));
  }

  return {
    gamesByTeam,
    seasonStart: minT === Infinity ? null : new Date(minT),
    seasonEnd: maxT === -Infinity ? null : new Date(maxT)
  };
}

export function resolveInitialMonth(teamTri, gamesByTeam, todayUTCDate) {
  const games = gamesByTeam.get(teamTri) || [];
  if (!games.length) return null;

  // Format YYYY-MM for today's date
  const todayMonthKey = formatMonthKey(todayUTCDate);

  // Check if today's month has a game
  const hasGameInTodayMonth = games.some(g => g.date_utc.startsWith(todayMonthKey));
  if (hasGameInTodayMonth) return todayMonthKey;

  // Else first game month
  const firstGame = games[0];
  return firstGame.date_utc.slice(0, 7);
}

export function formatMonthKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

export function monthKeyToDate(monthKey) {
  // monthKey: YYYY-MM
  const [y, m] = monthKey.split("-");
  return new Date(parseInt(y,10), parseInt(m,10)-1, 1);
}

export function shiftMonth(monthKey, delta) {
  const d = monthKeyToDate(monthKey);
  d.setMonth(d.getMonth() + delta);
  return formatMonthKey(d);
}

export function compareMonthKey(a, b) {
  return a.localeCompare(b);
}

export function monthBounds(monthKey, seasonStart, seasonEnd) {
  if (!seasonStart || !seasonEnd) return { before: false, after: false };
  const minKey = formatMonthKey(seasonStart);
  const maxKey = formatMonthKey(seasonEnd);
  return {
    before: compareMonthKey(monthKey, minKey) < 0,
    after: compareMonthKey(monthKey, maxKey) > 0
  };
}

export function buildCalendarMatrix(monthKey) {
  // Monday start, always 6 rows * 7 columns = 42 cells
  const [y, m] = monthKey.split("-");
  const year = parseInt(y,10);
  const month = parseInt(m,10)-1;
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  // Day of week (0=Sun..6=Sat); need Monday start
  // Determine offset: Monday=1. If firstOfMonth is Monday -> offset 0
  let startOffset = firstOfMonth.getUTCDay() - 1;
  if (startOffset < 0) startOffset = 6; // Sunday becomes 6 offset

  const days = [];
  // We want 42 cells
  for (let i=0;i<42;i++){
    const cellDate = new Date(Date.UTC(year, month, 1 - startOffset + i));
    const cellMonth = cellDate.getUTCMonth();
    days.push({
      date: cellDate,
      inMonth: cellMonth === month
    });
  }
  return days;
}

export function findGameForTeamOnDate(teamTri, dateObj, gamesByTeam) {
  const games = gamesByTeam.get(teamTri);
  if (!games) return null;
  const dateKey = dateObj.toISOString().slice(0,10);
  return games.find(g => g.date_utc.startsWith(dateKey));
}

export function getOpponentAndHomeAway(game, teamTri) {
  const isHome = game.home_tri === teamTri;
  const opponent = isHome ? game.away_tri : game.home_tri;
  return { opponent, isHome };
}

export function pickTeamColor(tri) {
  const c = TEAM_PRIMARY_COLORS[tri];
  return c || "#19a2b3";
}

export function chooseTextColor(bgHex) {
  // Simple luminance heuristic
  const hex = bgHex.replace("#","").toLowerCase();
  if (hex.length === 3) {
    const r = parseInt(hex[0]+hex[0],16);
    const g = parseInt(hex[1]+hex[1],16);
    const b = parseInt(hex[2]+hex[2],16);
    return luminance(r,g,b) > 0.55 ? "#222" : "#fff";
  }
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  return luminance(r,g,b) > 0.55 ? "#222" : "#fff";
}

function luminance(r,g,b){
  const a = [r,g,b].map(v=>{
    v/=255;
    return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
  });
  return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
}
