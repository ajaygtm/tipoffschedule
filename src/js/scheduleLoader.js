// scheduleLoader.js - fetch & cache schedule JSON

const SCHEDULE_URL = "data/schedule/nba_2024_25_regular.mock.json";

let _scheduleCache = null;

export async function loadSchedule() {
  if (_scheduleCache) return _scheduleCache;
  const res = await fetch(SCHEDULE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to load schedule JSON");
  const data = await res.json();
  // Basic shape guard
  if (!data.games || !Array.isArray(data.games)) {
    throw new Error("Schedule JSON malformed: missing games array");
  }
  _scheduleCache = data;
  return data;
}

export function getGamesByDate(schedule) {
  // Returns a map of dateKey -> array of games
  const map = new Map();
  for (const g of schedule.games) {
    const date = new Date(g.date_utc); // UTC
    const key = date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC day)
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  return map;
}

export function findScheduleDateBounds(schedule) {
  if (!schedule.games.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const g of schedule.games) {
    const t = Date.parse(g.date_utc);
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { start: new Date(min), end: new Date(max) };
}
