// teamsLoader.js - fetch & structure team metadata

const TEAMS_URL = "data/teams/nba_teams.json";

let _teamsCache = null;
let _byTri = null;
let _byId = null;

export async function loadTeams() {
  if (_teamsCache) return _teamsCache;
  const res = await fetch(TEAMS_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to load teams JSON");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Teams JSON malformed");
  _teamsCache = data;
  _byTri = new Map();
  _byId = new Map();
  for (const t of data) {
    _byTri.set(t.tri, t);
    _byId.set(t.team_id, t);
  }
  return data;
}

export function getTeamByTri(tri) {
  return _byTri?.get(tri) || null;
}

export function getTeamById(id) {
  return _byId?.get(id) || null;
}

export function allTeamsSorted() {
  if (!_teamsCache) return [];
  return [..._teamsCache].sort((a, b) => a.tri.localeCompare(b.tri));
}
