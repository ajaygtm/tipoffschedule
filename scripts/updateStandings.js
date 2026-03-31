#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const util = require("util");
const { normalizeTri } = require("./config");

const writeFile = util.promisify(fs.writeFile);

const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";
const OUT_PATH = path.resolve(__dirname, "../data/standings.json");

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Fetching NBA standings from ESPN...");
  const json = await getJson(STANDINGS_URL);

  const eastern = [];
  const western = [];

  const conferences = Array.isArray(json && json.children) ? json.children : [];
  if (!conferences.length) {
    throw new Error("Unexpected standings structure: children array missing or empty");
  }

  for (const conf of conferences) {
    const name = String(conf.name || "").toLowerCase();
    const isEastern = name.includes("eastern") || name.includes("east");
    const isWestern = name.includes("western") || name.includes("west");
    if (!isEastern && !isWestern) continue;

    const entries = readPath(conf, ["standings", "entries"]);
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const team = entry.team;
      if (!team) continue;

      const tri = normalizeTri(team.abbreviation);
      const displayName = String(team.displayName || team.name || tri);
      const shortName = String(team.shortDisplayName || team.name || tri);

      const stats = Array.isArray(entry.stats) ? entry.stats : [];
      const statMap = new Map(stats.map(s => [s.name, s]));

      const wins = toInt(getStat(statMap, "wins"));
      const losses = toInt(getStat(statMap, "losses"));
      const pct = getStatDisplay(statMap, "winPercent") || formatPct(wins, losses);
      const rawGb = getStatDisplay(statMap, "gamesBehind");
      const gb = !rawGb || rawGb === "0" || rawGb === "0.0" ? "-" : rawGb;
      const streak = getStatDisplay(statMap, "streak") || "-";
      const l10 = getStatDisplay(statMap, "Last Ten Games") || "-";
      const rank = toInt(getStat(statMap, "playoffSeed")) || 0;

      const row = { rank, tri, name: displayName, shortName, wins, losses, pct, gb, streak, l10 };

      if (isEastern) eastern.push(row);
      else western.push(row);
    }
  }

  eastern.sort((a, b) => a.rank - b.rank || b.wins - a.wins);
  western.sort((a, b) => a.rank - b.rank || b.wins - a.wins);

  // Re-number so ranks are always 1–15 in order after sort
  eastern.forEach((row, i) => { row.rank = i + 1; });
  western.forEach((row, i) => { row.rank = i + 1; });

  const output = {
    updated: new Date().toISOString(),
    eastern,
    western
  };

  if (!dryRun) {
    await writeFile(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Wrote standings to ${OUT_PATH}`);
  }

  console.log(`Eastern teams: ${eastern.length}, Western teams: ${western.length}`);
  if (dryRun) console.log("Dry run complete. No files written.");
}

function getStat(statMap, name) {
  const s = statMap.get(name);
  return s ? s.value : undefined;
}

function getStatDisplay(statMap, name) {
  const s = statMap.get(name);
  return s ? (s.displayValue || String(s.value)) : undefined;
}

function formatPct(wins, losses) {
  if (!Number.isFinite(wins) || !Number.isFinite(losses)) return "-";
  const total = wins + losses;
  if (total === 0) return ".000";
  return (wins / total).toFixed(3).replace(/^0/, "");
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
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
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${err.message}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(new Error("Request timed out")); });
  });
}

main().catch(err => {
  console.error("[updateStandings] error:", err.message);
  process.exit(1);
});
