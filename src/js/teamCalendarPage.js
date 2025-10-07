import { loadSchedule } from "./scheduleLoader.js";
import { loadTeams, getTeamByTri } from "./teamsLoader.js";
import {
  dateKeyInZone,
  formatTimeInZone
} from "./dateUtils.js";
import {
  buildTeamIndexes,
  resolveInitialMonth,
  formatMonthKey,
  shiftMonth,
  getOpponentAndHomeAway
} from "./teamView.js";
import { initIcsTeamButton } from "./ics.js";  // <--- ADDED

/*
Team Calendar Page – XL Sizing Update
*/

const TZ_STORAGE_KEY = "tos_tz_pref";
const TIMEZONE_OPTIONS = [
  { key:"local", label:"MY TIMEZONE", zone:null, menuHint:"" },
  { key:"ET",    label:"ET", zone:"America/New_York",    menuHint:"(Eastern)" },
  { key:"PT",    label:"PT", zone:"America/Los_Angeles", menuHint:"(Pacific)" },
  { key:"CT",    label:"CT", zone:"America/Chicago",     menuHint:"(Central)" }
];
const FIXED_ZONE_ABBR = {
  "America/New_York":"ET",
  "America/Los_Angeles":"PT",
  "America/Chicago":"CT"
};

const MASTER_TEAM_NAMES = {
  ATL:"Atlanta Hawks", BOS:"Boston Celtics", BKN:"Brooklyn Nets", CHA:"Charlotte Hornets",
  CHI:"Chicago Bulls", CLE:"Cleveland Cavaliers", DAL:"Dallas Mavericks", DEN:"Denver Nuggets",
  DET:"Detroit Pistons", GSW:"Golden State Warriors", HOU:"Houston Rockets", IND:"Indiana Pacers",
  LAC:"LA Clippers", LAL:"Los Angeles Lakers", MEM:"Memphis Grizzlies", MIA:"Miami Heat",
  MIL:"Milwaukee Bucks", MIN:"Minnesota Timberwolves", NOP:"New Orleans Pelicans", NYK:"New York Knicks",
  OKC:"Oklahoma City Thunder", ORL:"Orlando Magic", PHI:"Philadelphia 76ers", PHX:"Phoenix Suns",
  POR:"Portland Trail Blazers", SAC:"Sacramento Kings", SAS:"San Antonio Spurs", TOR:"Toronto Raptors",
  UTA:"Utah Jazz", WAS:"Washington Wizards"
};

const state = {
  schedule:null,
  teams:null,
  gamesByTeam:null,
  seasonStart:null,
  seasonEnd:null,
  selectedTeam:null,
  selectedMonth:null,
  selectedZone:"local",
  tzTeamCache:{}
};

init().catch(err=>{
  console.error("[TeamCalendar] init error", err);
  announce("Failed to initialize.");
});

async function init(){
  restoreTimezonePreference();
  await loadEverything();
  initIndexes();
  parseQueryParams();
  ensureMonthWithinSeason();
  initMonthNav();
  initTimezoneMenu();

  // ---- ICS TEAM BUTTON INIT (ADDED) ----
  initIcsTeamButton({
    buttonId: "btn-ics-team",
    scheduleUrl: "../data/schedule/nba_schedule_25_26.json",
    teamTri: state.selectedTeam
  });
  // --------------------------------------

  renderAll();
  window.addEventListener("popstate", ()=>{
    parseQueryParams();
    ensureMonthWithinSeason();
    renderAll();
  });
}

async function loadEverything(){
  const [schedule, teams] = await Promise.all([loadSchedule(), loadTeams()]);
  state.schedule = schedule;
  state.teams = teams;
}

function initIndexes(){
  const { gamesByTeam, seasonStart, seasonEnd } = buildTeamIndexes(state.schedule);
  state.gamesByTeam = gamesByTeam;
  state.seasonStart = seasonStart;
  state.seasonEnd = seasonEnd;
}

function parseQueryParams(){
  const params = new URLSearchParams(window.location.search);
  const tri = (params.get("team")||"").toUpperCase();
  if (!tri || !state.gamesByTeam.has(tri)){
    window.location.replace("teams.html");
    return;
  }
  state.selectedTeam = tri;
  let month = params.get("month");
  if (!/^\d{4}-\d{2}$/.test(month||"")){
    month = resolveInitialMonth(tri, state.gamesByTeam, new Date()) ||
      formatMonthKey(state.seasonStart||new Date());
  }
  state.selectedMonth = month;
}

function ensureMonthWithinSeason(){
  if (!state.selectedMonth) return;
  const minKey = formatMonthKey(state.seasonStart||new Date());
  const maxKey = formatMonthKey(state.seasonEnd||new Date());
  if (state.selectedMonth < minKey) state.selectedMonth = minKey;
  if (state.selectedMonth > maxKey) state.selectedMonth = maxKey;
}

function pushMonth(newMonth){
  const url = new URL(window.location.href);
  url.searchParams.set("team", state.selectedTeam);
  url.searchParams.set("month", newMonth);
  history.pushState(null,"",url.toString());
  state.selectedMonth = newMonth;
  renderMonthHeader();
  renderCalendar();
  announce(`Showing ${monthLabel(newMonth)} for ${state.selectedTeam}`);
}

function buildTeamZoneMap(team, zoneId){
  const cacheKey = `${team}__${zoneId}`;
  if (state.tzTeamCache[cacheKey]) return state.tzTeamCache[cacheKey];
  const games = state.gamesByTeam.get(team) || [];
  const map = new Map();
  for (const g of games){
    const key = dateKeyInZone(g.date_utc, zoneId);
    if (!map.has(key)) map.set(key, g);
  }
  state.tzTeamCache[cacheKey] = map;
  return map;
}

function buildCalendarMatrixTZ(monthKey, zoneId){
  const [y,m] = monthKey.split("-");
  const year = parseInt(y,10);
  const monthIdx = parseInt(m,10)-1;
  const daysInMonth = new Date(Date.UTC(year, monthIdx+1, 0)).getUTCDate();

  const weekdayName = dUTC => new Intl.DateTimeFormat("en-US",{weekday:"short", timeZone:zoneId}).format(dUTC);
  const wk = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const toMonStart = sun0 => (sun0 + 6) % 7;

  const firstUTC = new Date(Date.UTC(year, monthIdx, 1, 12));
  const lastUTC  = new Date(Date.UTC(year, monthIdx, daysInMonth, 12));
  const firstOffset = toMonStart(wk[weekdayName(firstUTC)] ?? 0);
  const lastOffset  = 6 - toMonStart(wk[weekdayName(lastUTC)] ?? 0);

  const cells = [];

  for (let i=0;i<firstOffset;i++){
    const dUTC = new Date(Date.UTC(year, monthIdx, 1 - (firstOffset - i), 12));
    const localKey = dateKeyInZone(dUTC.toISOString(), zoneId);
    cells.push({ localKey, inMonth:false, dayNum: parseInt(localKey.slice(-2),10) });
  }
  for (let day=1; day<=daysInMonth; day++){
    const dUTC = new Date(Date.UTC(year, monthIdx, day, 12));
    const localKey = dateKeyInZone(dUTC.toISOString(), zoneId);
    cells.push({ localKey, inMonth:true, dayNum: day });
  }
  for (let i=0;i<lastOffset;i++){
    const dUTC = new Date(Date.UTC(year, monthIdx, daysInMonth + 1 + i, 12));
    const localKey = dateKeyInZone(dUTC.toISOString(), zoneId);
    cells.push({ localKey, inMonth:false, dayNum: parseInt(localKey.slice(-2),10) });
  }
  return cells;
}

function renderAll(){
  renderHeading();
  renderMonthHeader();
  renderCalendar();
}

function renderHeading(){
  const el = document.getElementById("team-cal-heading");
  const full = resolveFullTeamName(state.selectedTeam);
  const season = state.schedule?.season || "";
  el.textContent = `${full} ${season} Season`;
}

function resolveFullTeamName(tri){
  const t = getTeamByTri(tri);
  if (t?.name) return t.name;
  return MASTER_TEAM_NAMES[tri] || tri;
}

function renderMonthHeader(){
  document.getElementById("month-label").textContent = monthLabel(state.selectedMonth);
  const prevBtn = document.getElementById("month-prev");
  const nextBtn = document.getElementById("month-next");
  prevBtn.disabled = isBeforeSeasonMonth(shiftMonth(state.selectedMonth,-1));
  nextBtn.disabled = isAfterSeasonMonth(shiftMonth(state.selectedMonth,1));
}

function renderCalendar(){
  const grid = document.getElementById("team-calendar-grid");
  Array.from(grid.children).slice(7).forEach(n=>n.remove());

  const zoneId = currentZoneId();
  const map = buildTeamZoneMap(state.selectedTeam, zoneId);
  const cells = buildCalendarMatrixTZ(state.selectedMonth, zoneId);

  cells.forEach(cell=>{
    const div = document.createElement("div");
    div.className = "day-cell day-cell--dynamic";
    if (!cell.inMonth) div.classList.add("outside");
    div.tabIndex = 0;

    const dn = document.createElement("div");
    dn.className = "day-number day-number--xl";
    dn.textContent = cell.dayNum;
    div.appendChild(dn);

    const game = map.get(cell.localKey);
    if (game){
      const zoneAbbr = zoneAbbreviation(zoneId);
      const { time, abbr } = formatTimeInZone(game.date_utc, zoneId);
      const finalAbbr = state.selectedZone === "local" ? (abbr || "") : (zoneAbbr || abbr || "");
      const timeStr = `${time} ${finalAbbr}`.trim();
      const matchupText = `${game.away_tri} @ ${game.home_tri}`;
      const { opponent, isHome } = getOpponentAndHomeAway(game, state.selectedTeam);
      const stage = compactStage(game.season_stage);

      const mini = document.createElement("div");
      mini.className = "game-mini game-mini--xl";
      mini.innerHTML = `
        <div class="game-mini-stage">${stage}</div>
        <div class="game-mini-logos game-mini-logos--xl">
          ${logoOrFallback(game.away_tri)}
          ${logoOrFallback(game.home_tri)}
        </div>
        <div class="game-mini-matchup game-mini-matchup--xl">${matchupText}</div>
        <div class="game-mini-time game-mini-time--xl">${timeStr}</div>
      `;
      div.appendChild(mini);

      const pill = document.createElement("div");
      pill.className = "game-pill-mobile game-pill-mobile--xl";
      pill.textContent = `${stage} ${isHome ? "vs" : "@"} ${opponent}`;
      const pillTime = document.createElement("span");
      pillTime.className = "game-pill-time game-pill-time--xl";
      pillTime.textContent = timeStr;
      pill.appendChild(pillTime);
      div.appendChild(pill);

      const awayFull = resolveFullTeamName(game.away_tri);
      const homeFull = resolveFullTeamName(game.home_tri);
      div.setAttribute(
        "aria-label",
        `${fullDateA11y(cell.localKey, zoneId)}: ${awayFull} at ${homeFull} ${timeStr} ${stage}`
      );
    } else {
      div.setAttribute("aria-label", fullDateA11y(cell.localKey, zoneId));
    }

    grid.appendChild(div);
  });
}

function compactStage(stage){
  if (!stage) return "REG";
  const s = stage.toLowerCase();
  if (s.startsWith("pre")) return "PRE";
  if (s.startsWith("reg")) return "REG";
  if (s.startsWith("play")) return "PO";
  return stage.slice(0,3).toUpperCase();
}

function monthLabel(monthKey){
  const [y,m]=monthKey.split("-");
  const d=new Date(Date.UTC(parseInt(y,10), parseInt(m,10)-1,1));
  return d.toLocaleString(undefined,{month:"long", year:"numeric"});
}

function isBeforeSeasonMonth(monthKey){
  if (!state.seasonStart) return false;
  return monthKey < formatMonthKey(state.seasonStart);
}
function isAfterSeasonMonth(monthKey){
  if (!state.seasonEnd) return false;
  return monthKey > formatMonthKey(state.seasonEnd);
}

function fullDateA11y(localKey, zoneId){
  const [y,m,d]=localKey.split("-");
  const dateUTC=new Date(Date.UTC(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10), 12));
  return new Intl.DateTimeFormat(undefined,{
    timeZone:zoneId,
    month:"long",
    day:"numeric",
    year:"numeric"
  }).format(dateUTC);
}

function logoOrFallback(tri){
  return `<img src="assets/logos/${tri}.svg" alt="${tri} logo" loading="lazy" decoding="async"
    onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'tri-f',textContent:'${tri}'}))">`;
}

function zoneAbbreviation(zoneId){
  if (!zoneId) return "";
  if (FIXED_ZONE_ABBR[zoneId]) return FIXED_ZONE_ABBR[zoneId];
  try{
    const parts = new Intl.DateTimeFormat(undefined,{
      timeZone: zoneId,
      hour:"2-digit",
      minute:"2-digit",
      timeZoneName:"short"
    }).formatToParts(new Date());
    const tz = parts.find(p=>p.type==="timeZoneName");
    return tz ? tz.value : "";
  }catch{return "";}
}

function initMonthNav(){
  document.getElementById("month-prev")?.addEventListener("click", ()=>{
    const candidate = shiftMonth(state.selectedMonth,-1);
    if (isBeforeSeasonMonth(candidate)) return;
    pushMonth(candidate);
  });
  document.getElementById("month-next")?.addEventListener("click", ()=>{
    const candidate = shiftMonth(state.selectedMonth,1);
    if (isAfterSeasonMonth(candidate)) return;
    pushMonth(candidate);
  });
}

function restoreTimezonePreference(){
  try{
    const stored = localStorage.getItem(TZ_STORAGE_KEY);
    if (stored && TIMEZONE_OPTIONS.some(o=>(o.zone||o.key)===stored || o.key===stored)){
      const byZone = TIMEZONE_OPTIONS.find(o=>o.zone===stored);
      state.selectedZone = byZone ? byZone.key : stored;
    }
  }catch{}
}
function getSelectedTzOption(){
  return TIMEZONE_OPTIONS.find(o=>o.key===state.selectedZone)||TIMEZONE_OPTIONS[0];
}
function currentZoneId(){
  const opt = getSelectedTzOption();
  return opt.zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function persistTimezonePreference(){
  try{
    const opt = getSelectedTzOption();
    localStorage.setItem(TZ_STORAGE_KEY, opt.zone || opt.key);
  }catch{}
}

function initTimezoneMenu(){
  const trigger = document.getElementById("tz-trigger");
  const menu = document.getElementById("tz-menu");
  if (!trigger || !menu) return;
  rebuildMenu();

  trigger.addEventListener("click", ()=>{
    const open = trigger.getAttribute("aria-expanded")==="true";
    setOpen(!open);
  });
  document.addEventListener("click", e=>{
    if (!menu.contains(e.target) && e.target!==trigger) setOpen(false);
  });
  document.addEventListener("keydown", e=>{
    if (e.key==="Escape") setOpen(false);
  });

  function setOpen(open){
    trigger.setAttribute("aria-expanded", open?"true":"false");
    menu.classList.toggle("open", open);
    if (open){
      const sel = menu.querySelector('[data-selected="true"]');
      sel?.focus({preventScroll:true});
    }
  }

  function rebuildMenu(){
    menu.innerHTML="";
    const localAbbr = deriveLocalAbbrev();
    TIMEZONE_OPTIONS.forEach(opt=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="tz-option";
      const selected = opt.key===state.selectedZone;
      btn.dataset.selected = selected?"true":"false";
      let label = opt.label;
      if (opt.key==="local" && localAbbr) label += ` (${localAbbr})`;
      if (opt.menuHint) label += ` ${opt.menuHint}`;
      btn.textContent = label;
      btn.setAttribute("role","menuitemradio");
      btn.setAttribute("aria-checked", selected?"true":"false");
      btn.addEventListener("click", ()=>{
        if (state.selectedZone !== opt.key){
          state.selectedZone = opt.key;
          persistTimezonePreference();
          state.tzTeamCache = {};
          renderCalendar();
        }
        trigger.setAttribute("aria-expanded","false");
        menu.classList.remove("open");
        rebuildMenu();
      });
      menu.appendChild(btn);
    });
  }
}

function deriveLocalAbbrev(){
  try{
    const parts = new Intl.DateTimeFormat(undefined,{
      timeZoneName:"short",
      hour:"2-digit",
      minute:"2-digit"
    }).formatToParts(new Date());
    const tz = parts.find(p=>p.type==="timeZoneName");
    return tz? tz.value : "";
  }catch{return "";}
}

function announce(msg){
  const el = document.getElementById("announce");
  if (!el) return;
  el.textContent="";
  setTimeout(()=>{ el.textContent=msg; }, 25);
}
