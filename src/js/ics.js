// ICS generation for TipOffSchedule adapted to official NBA JSON structure.
//
// JSON shape consumed (no modification required):
// {
//   "meta": {...},
//   "leagueSchedule": {
//      "seasonYear": "2025-26",
//      "leagueId": "00",
//      "gameDates": [
//         { "gameDate": "...", "games":[ { gameId, gameDateTimeUTC, gameDateUTC,
//             arenaName, arenaCity, arenaState,
//             homeTeam:{teamTricode,...}, awayTeam:{teamTricode,...} } ] }
//      ]
//   }
// }
//
// VARIANTS:
//  - All Teams Full Season  (per-event color = home team color)
//  - Single Team Full Season (all events = selected team color)
//
// EVENT FIELDS:
//  DTSTART: UTC start (gameDateTimeUTC preferred; fallback gameDateUTC)
//  DTEND: +150 minutes
//  UID: {gameId}@tipoffschedule
//  SUMMARY: AwayShort @ HomeShort    (requested short fan forms)
//  DESCRIPTION: Multi-line (requested wording)
//  LOCATION: arenaName, city, state (fallbacks gracefully)
//  Custom X- props: X-TIPOFF-HOME, X-TIPOFF-AWAY, X-TIPOFF-COLOR
//
// Calendar X- props for color hints.
// All times emitted in UTC (Z) so clients auto-adjust.
//
// PUBLIC API:
//   initIcsAllTeamsButton({ buttonId, scheduleUrl })
//   initIcsTeamButton({ buttonId, scheduleUrl, teamTri })
//
// -------------------------------------------------------------------------

// Full names kept for internal fallback (not shown in SUMMARY now)
const TEAM_FULL = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets", CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers", DAL: "Dallas Mavericks", DEN: "Denver Nuggets",
  DET: "Detroit Pistons", GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies", MIA: "Miami Heat",
  MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", NOP: "New Orleans Pelicans", NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs", TOR: "Toronto Raptors",
  UTA: "Utah Jazz", WAS: "Washington Wizards"
};

// Requested short fan-facing forms (used in SUMMARY + calendar title for team exports)
const TEAM_SHORT = {
  ATL: "Hawks",
  BOS: "Celtics",
  BKN: "Nets",
  CHA: "Hornets",
  CHI: "Bulls",
  CLE: "Cavs",
  DAL: "Mavs",
  DEN: "Nuggets",
  DET: "Pistons",
  GSW: "Warriors",
  HOU: "Rockets",
  IND: "Pacers",
  LAC: "Clippers",
  LAL: "Lakers",
  MEM: "Grizzlies",
  MIA: "Heat",
  MIL: "Bucks",
  MIN: "Timberwolves",
  NOP: "Pelicans",
  NYK: "Knicks",
  OKC: "Thunder",
  ORL: "Magic",
  PHI: "Sixers",
  PHX: "Suns",
  POR: "Blazers",
  SAC: "Kings",
  SAS: "Spurs",
  TOR: "Raptors",
  UTA: "Jazz",
  WAS: "Wizards"
};

const ACCENT_FALLBACK = "#19a2b3";

// Dynamic team color resolver (optional teamColors.js)
let _teamColorResolver = null;
(async () => {
  try {
    const mod = await import('./teamColors.js');
    if (typeof mod.getTeamColors === 'function') {
      _teamColorResolver = tri => mod.getTeamColors(tri);
    } else if (mod.TEAM_COLORS) {
      _teamColorResolver = tri => mod.TEAM_COLORS[tri];
    }
  } catch { /* ignore */ }
})();

function getPrimaryColor(tri) {
  if (_teamColorResolver) {
    try {
      const c = _teamColorResolver(tri);
      if (c) {
        if (typeof c === 'string') return c;
        if (c.primary) return c.primary;
        if (c.main) return c.main;
        if (Array.isArray(c) && c.length) return c[0];
      }
    } catch { /* ignore */ }
  }
  const minimal = {
    LAL:'#552583', BOS:'#007A33', CHI:'#CE1141', GSW:'#1D428A', MIA:'#98002E',
    NYK:'#F58426', PHX:'#1D1160', DAL:'#00538C', MIN:'#0C2340', SAS:'#C4CED4'
  };
  return minimal[tri] || ACCENT_FALLBACK;
}

// Fetch & cache schedule
let _schedulePromise = null;
async function fetchSchedule(scheduleUrl) {
  if (_schedulePromise) return _schedulePromise;
  _schedulePromise = fetch(scheduleUrl, { cache: 'no-cache' })
    .then(r => {
      if (!r.ok) throw new Error('Schedule fetch failed: ' + r.status);
      return r.json();
    })
    .then(j => {
      if (!j || !j.leagueSchedule || !Array.isArray(j.leagueSchedule.gameDates)) {
        console.error('[ICS] Unexpected schedule structure. Keys:', Object.keys(j || {}));
        throw new Error('Unsupported schedule JSON structure');
      }
      return j;
    });
  return _schedulePromise;
}

// Flatten official structure
function flattenGames(scheduleJson) {
  const out = [];
  const dates = scheduleJson.leagueSchedule?.gameDates || [];
  for (const gd of dates) {
    const games = gd.games || [];
    for (const g of games) {
      const startUtc = g.gameDateTimeUTC || g.gameDateUTC;
      if (!startUtc) continue;
      const home_tri = g.homeTeam?.teamTricode;
      const away_tri = g.awayTeam?.teamTricode;
      if (!home_tri || !away_tri) continue;

      out.push({
        game_id: g.gameId || g.gameCode || `${home_tri}${away_tri}${startUtc}`,
        date_utc: startUtc,
        home_tri,
        away_tri,
        arena_name: g.arenaName || g.arena || '',
        arena_city: g.arenaCity || g.city || '',
        arena_state: g.arenaState || g.state || '',
        isNeutral: !!g.isNeutral
      });
    }
  }
  return out;
}

// Date helpers
function toIcsUtc(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = n => String(n).padStart(2,'0');
  return d.getUTCFullYear()
    + pad(d.getUTCMonth()+1)
    + pad(d.getUTCDate())
    + 'T'
    + pad(d.getUTCHours())
    + pad(d.getUTCMinutes())
    + pad(d.getUTCSeconds())
    + 'Z';
}
function addMinutes(date, mins) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + mins * 60000);
}

// ICS escaping/folding
function icsEscape(str) {
  return String(str)
    .replace(/\\/g,'\\\\')
    .replace(/,/g,'\\,')
    .replace(/;/g,'\\;')
    .replace(/\r?\n/g,'\\n');
}
function foldLines(raw) {
  return raw
    .split('\r\n')
    .map(line => {
      if (line.length <= 75) return line;
      let out = '';
      while (line.length > 75) {
        out += line.slice(0,75) + '\r\n ';
        line = line.slice(75);
      }
      out += line;
      return out;
    })
    .join('\r\n');
}

// Venue formatting
function formatLocation(game) {
  const parts = [];
  if (game.arena_name) parts.push(game.arena_name);
  const cityState = [game.arena_city, game.arena_state].filter(Boolean).join(', ');
  if (cityState) parts.push(cityState);
  if (!parts.length) return 'Venue: (Not Provided)';
  return parts.join(', ');
}

// Build event
function buildEvent(game, seasonLabel, {
  perEventColor,
  forceTeamColor
}) {
  const start = new Date(game.date_utc);
  if (isNaN(start.getTime())) return null;
  const end = addMinutes(start, 150);

  const awayShort = TEAM_SHORT[game.away_tri] || game.away_tri;
  const homeShort = TEAM_SHORT[game.home_tri] || game.home_tri;

  // SUMMARY now uses short forms
  const summary = `${awayShort} @ ${homeShort}`;

  // Updated DESCRIPTION (requested multi-line)
  const description = "Unofficial NBA schedule from TipOffSchedule.com\n(Not affiliated with or endorsed by the NBA).";

  const location = formatLocation(game);

  const color = forceTeamColor
    ? forceTeamColor
    : (perEventColor ? perEventColor(game) : ACCENT_FALLBACK);

  return [
    'BEGIN:VEVENT',
    `UID:${icsEscape(game.game_id)}@tipoffschedule`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(location)}`,
    `X-TIPOFF-HOME:${icsEscape(game.home_tri)}`,
    `X-TIPOFF-AWAY:${icsEscape(game.away_tri)}`,
    `X-TIPOFF-COLOR:${icsEscape(color)}`,
    'END:VEVENT'
  ].join('\r\n');
}

// Calendar builder
function buildCalendar(events, { calName, calendarColor }) {
  const header = [
    'BEGIN:VCALENDAR',
    'PRODID:-//TipOffSchedule//NBA Regular Season//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    'X-WR-TIMEZONE:UTC',
    calendarColor ? `X-APPLE-CALENDAR-COLOR:${calendarColor}` : null,
    calendarColor ? `X-TIPOFF-CALENDAR-COLOR:${calendarColor}` : null
  ].filter(Boolean);

  const raw = header.join('\r\n') + '\r\n' + events.join('\r\n') + '\r\nEND:VCALENDAR';
  return foldLines(raw) + '\r\n';
}

// Generators
function generateAllTeamsIcs(scheduleJson) {
  const seasonLabel = scheduleJson.leagueSchedule?.seasonYear || 'Season';
  const games = flattenGames(scheduleJson);
  if (!games.length) throw new Error('No games found in schedule JSON.');
  const events = [];
  for (const g of games) {
    const evt = buildEvent(g, seasonLabel, {
      perEventColor: game => getPrimaryColor(game.home_tri),
      forceTeamColor: null
    });
    if (evt) events.push(evt);
  }
  return buildCalendar(events, {
    calName: `TipOffSchedule All Teams ${seasonLabel}`,
    calendarColor: ACCENT_FALLBACK
  });
}

function generateTeamIcs(scheduleJson, teamTri) {
  const seasonLabel = scheduleJson.leagueSchedule?.seasonYear || 'Season';
  const games = flattenGames(scheduleJson).filter(
    g => g.home_tri === teamTri || g.away_tri === teamTri
  );
  if (!games.length) throw new Error(`No games found for team ${teamTri}.`);
  const teamColor = getPrimaryColor(teamTri);
  const short = TEAM_SHORT[teamTri] || teamTri;
  const events = [];
  for (const g of games) {
    const evt = buildEvent(g, seasonLabel, {
      perEventColor: null,
      forceTeamColor: teamColor
    });
    if (evt) events.push(evt);
  }
  return buildCalendar(events, {
    calName: `${short} ${seasonLabel}`,
    calendarColor: teamColor
  });
}

// Download helper
function triggerDownload(icsText, filename) {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Button initializers
export function initIcsAllTeamsButton({ buttonId, scheduleUrl }) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Building...';
    try {
      const data = await fetchSchedule(scheduleUrl);
      const ics = generateAllTeamsIcs(data);
      const seasonSafe = (data.leagueSchedule?.seasonYear || 'season').replace(/[^a-z0-9_-]+/gi,'_');
      triggerDownload(ics, `tipoffschedule_nba_${seasonSafe}.ics`);
      btn.textContent = 'Downloaded';
      setTimeout(()=>btn.textContent = original, 1600);
    } catch (e) {
      console.error('[ICS] All teams export error', e);
      btn.textContent = 'Error';
      setTimeout(()=>btn.textContent = original, 2200);
    } finally {
      btn.disabled = false;
    }
  });
}

export function initIcsTeamButton({ buttonId, scheduleUrl, teamTri }) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Building...';
    try {
      const data = await fetchSchedule(scheduleUrl);
      const ics = generateTeamIcs(data, teamTri);
      const seasonSafe = (data.leagueSchedule?.seasonYear || 'season').replace(/[^a-z0-9_-]+/gi,'_');
      triggerDownload(ics, `tipoffschedule_${teamTri}_nba_${seasonSafe}.ics`);
      btn.textContent = 'Downloaded';
      setTimeout(()=>btn.textContent = original, 1600);
    } catch (e) {
      console.error('[ICS] Team export error', e);
      btn.textContent = 'Error';
      setTimeout(()=>btn.textContent = original, 2200);
    } finally {
      btn.disabled = false;
    }
  });
}