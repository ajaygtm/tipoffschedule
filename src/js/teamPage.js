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
  buildCalendarMatrix,
  findGameForTeamOnDate,
  getOpponentAndHomeAway,
  pickTeamColor,
  chooseTextColor
} from "./teamView.js";

/* Team Page State */
const TZ_STORAGE_KEY = "tos_tz_pref";
const TIMEZONE_OPTIONS = [
  { key:"local", label:"MY TIMEZONE", zone:null, menuHint:"" },
  { key:"ET", label:"ET", zone:"America/New_York", menuHint:"(Eastern)" },
  { key:"PT", label:"PT", zone:"America/Los_Angeles", menuHint:"(Pacific)" },
  { key:"CT", label:"CT", zone:"America/Chicago", menuHint:"(Central)" }
];
const FIXED_ZONE_ABBR = {
  "America/New_York":"ET",
  "America/Los_Angeles":"PT",
  "America/Chicago":"CT"
};

const state = {
  schedule:null,
  teams:null,
  gamesByTeam:null,
  seasonStart:null,
  seasonEnd:null,
  selectedTeam:null,
  selectedMonth:null,
  selectedZone:"local"
};

init().catch(e=>{
  console.error(e);
  announce("Failed to load schedule.");
});

async function init(){
  restoreTimezonePreference();
  await loadData();
  initTeamIndexes();
  parseHash();
  render();
  initEvents();
  initTimezoneMenu();
  window.addEventListener("hashchange", ()=> {
    parseHash();
    render();
  });
}

async function loadData(){
  const [schedule, teams] = await Promise.all([loadSchedule(), loadTeams()]);
  state.schedule = schedule;
  state.teams = teams;
}

function initTeamIndexes(){
  const { gamesByTeam, seasonStart, seasonEnd } = buildTeamIndexes(state.schedule);
  state.gamesByTeam = gamesByTeam;
  state.seasonStart = seasonStart;
  state.seasonEnd = seasonEnd;
}

/* Hash: #LAL or #LAL&month=YYYY-MM */
function parseHash(){
  const h = window.location.hash.replace(/^#/,"").trim();
  if (!h){
    state.selectedTeam = null;
    state.selectedMonth = null;
    return;
  }
  const parts = h.split("&");
  const teamPart = parts[0];
  const teamTri = teamPart.toUpperCase();
  if (!state.gamesByTeam.has(teamTri)){
    state.selectedTeam = null;
    state.selectedMonth = null;
    return;
  }
  state.selectedTeam = teamTri;

  const monthSeg = parts.find(p=>p.startsWith("month="));
  let monthKey = monthSeg ? monthSeg.split("=")[1] : null;
  if (!/^\d{4}-\d{2}$/.test(monthKey||"")){
    monthKey = resolveInitialMonth(teamTri, state.gamesByTeam, new Date()) ||
      formatMonthKey(state.seasonStart || new Date());
  }
  state.selectedMonth = monthKey;
}

/* Routing helpers */
function pushTeamHash(team, month=null){
  const base = `#${team}` + (month? `&month=${month}`:"");
  if (window.location.hash !== base){
    window.location.hash = base;
  } else {
    // Force refresh if same
    parseHash();
    render();
  }
}

function clearHash(){
  history.replaceState(null,"", window.location.pathname + window.location.search);
  state.selectedTeam = null;
  state.selectedMonth = null;
}

/* Rendering */
function render(){
  const gridView = document.getElementById("team-grid-view");
  const calView = document.getElementById("team-calendar-view");
  if (!state.selectedTeam){
    // Grid mode
    gridView.hidden = false;
    calView.hidden = true;
    renderTeamGrid();
  } else {
    gridView.hidden = true;
    calView.hidden = false;
    renderTeamCalendar();
  }
}

/* Team Grid */
function renderTeamGrid(){
  const grid = document.getElementById("team-grid");
  grid.innerHTML = "";
  state.teams.forEach(t=>{
    const tri = t.triCode || t.tri || t.teamTricode;
    if (!tri) return;
    const btn = document.createElement("button");
    btn.type="button";
    btn.className="team-tile";
    btn.dataset.team=tri;
    btn.setAttribute("aria-label", t.name? `${t.name} (${tri})`:tri);

    const img = document.createElement("img");
    img.className="team-tile-logo";
    img.src=`assets/logos/${tri}.svg`;
    img.alt="";
    img.loading="lazy";
    img.decoding="async";
    img.onerror=()=>img.style.visibility="hidden";

    const code = document.createElement("div");
    code.className="team-tile-code";
    code.textContent=tri;

    btn.appendChild(img);
    btn.appendChild(code);
    btn.addEventListener("click", ()=>{
      const initial = resolveInitialMonth(tri, state.gamesByTeam, new Date()) ||
        formatMonthKey(state.seasonStart||new Date());
      pushTeamHash(tri, initial);
      announce(`Showing ${monthLabel(initial)} for ${tri}`);
    });

    grid.appendChild(btn);
  });
}

/* Calendar (timezone-aware) */
function renderTeamCalendar(){
  const heading = document.getElementById("team-calendar-heading");
  heading.textContent = state.selectedTeam;

  const monthLabelEl = document.getElementById("month-label");
  monthLabelEl.textContent = monthLabel(state.selectedMonth);

  const prevBtn = document.getElementById("month-prev");
  const nextBtn = document.getElementById("month-next");

  prevBtn.disabled = isBeforeSeasonMonth(shiftMonth(state.selectedMonth,-1));
  nextBtn.disabled = isAfterSeasonMonth(shiftMonth(state.selectedMonth,1));

  const grid = document.getElementById("calendar-grid");
  // Remove prior cells (keep 7 DOW headers)
  const old = Array.from(grid.children).slice(7);
  old.forEach(n=>n.remove());

  const matrix = buildCalendarMatrixTimezone(state.selectedMonth, currentZoneId());
  for (const cell of matrix){
    const div = document.createElement("div");
    div.className="day-cell";
    if (!cell.inMonth) div.classList.add("outside");
    div.tabIndex = 0;

    const dn = document.createElement("div");
    dn.className="day-number";
    dn.textContent = cell.localDay;
    div.appendChild(dn);

    const game = findGameForTeamOnDateTZ(state.selectedTeam, cell, currentZoneId());
    if (game){
      const { opponent, isHome } = getOpponentAndHomeAway(game, state.selectedTeam);
      const pill = document.createElement("div");
      pill.className="game-pill";
      const color = pickTeamColor(state.selectedTeam);
      pill.style.background = color;
      pill.style.color = chooseTextColor(color);
      pill.textContent = `${isHome? "vs":"@"} ${opponent}`;
      div.appendChild(pill);

      // Accessible label
      const awayFull = getTeamByTri(game.away_tri)?.name || game.away_tri;
      const homeFull = getTeamByTri(game.home_tri)?.name || game.home_tri;
      div.setAttribute("aria-label",
        `${fullDateA11y(cell.localISO, currentZoneId())}: ${awayFull} at ${homeFull}`);
    } else {
      div.setAttribute("aria-label", fullDateA11y(cell.localISO, currentZoneId()));
    }

    grid.appendChild(div);
  }
}

/* Timezone-specific calendar helpers */
function buildCalendarMatrixTimezone(monthKey, zone){
  // monthKey YYYY-MM (in selected timezone context)
  // Build a matrix of 42 cells (6 weeks * 7) Monday-start.
  const [y,m] = monthKey.split("-");
  const year = parseInt(y,10);
  const monthIdx = parseInt(m,10)-1;

  // Build local first-of-month date at noon to avoid DST edge weirdness.
  const firstUTC = approximateZonedUTC(year, monthIdx, 1, 12, zone);
  // Determine local weekday (0=Sun..6=Sat)
  const localWeekday = weekdayInZone(firstUTC, zone); // 0=Sun
  // Monday start offset
  let startOffset = localWeekday - 1;
  if (startOffset < 0) startOffset = 6;

  const cells = [];
  for (let i=0; i<42; i++){
    const dayNum = 1 - startOffset + i; // local day reference
    // Compute a local date for that day (approx)
    const localUTC = approximateZonedUTC(year, monthIdx, dayNum, 12, zone);
    const { localISO, localMonthIdx, localDay } = extractLocalYMD(localUTC, zone);
    cells.push({
      localISO,       // YYYY-MM-DD
      localDay,       // numeric day
      inMonth: localMonthIdx === monthIdx
    });
  }
  return cells;
}

function findGameForTeamOnDateTZ(teamTri, cell, zone){
  const games = state.gamesByTeam.get(teamTri);
  if (!games) return null;
  // For each game, compute dateKeyInZone and compare
  const targetKey = cell.localISO;
  return games.find(g => dateKeyInZone(g.date_utc, zone) === targetKey) || null;
}

function approximateZonedUTC(year, monthIdx, day, hour, zone){
  // Start with a naive UTC date, then adjust guess by comparing local hour offset
  // Simplified approach: create Date in UTC, rely on toLocaleString for zone day comps.
  return new Date(Date.UTC(year, monthIdx, day, hour, 0, 0));
}

function weekdayInZone(dateUTC, zone){
  // Return 0..6 (Sun..Sat) in that zone
  const opts = { weekday:"short", timeZone:zone };
  const str = new Intl.DateTimeFormat("en-US", opts).format(dateUTC);
  const map = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return map[str] ?? 0;
}

function extractLocalYMD(dateUTC, zone){
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone:zone,
    year:"numeric", month:"2-digit", day:"2-digit"
  });
  const iso = fmt.format(dateUTC); // YYYY-MM-DD
  const parts = iso.split("-");
  return {
    localISO: iso,
    localMonthIdx: parseInt(parts[1],10)-1,
    localDay: parseInt(parts[2],10)
  };
}

/* Dates / Bounds */
function monthLabel(monthKey){
  const [y,m]=monthKey.split("-");
  const d=new Date(Date.UTC(parseInt(y,10), parseInt(m,10)-1,1));
  return d.toLocaleString(undefined,{month:"long", year:"numeric"});
}
function isBeforeSeasonMonth(monthKey){
  if (!state.seasonStart) return false;
  const min = formatMonthKey(state.seasonStart);
  return monthKey < min;
}
function isAfterSeasonMonth(monthKey){
  if (!state.seasonEnd) return false;
  const max = formatMonthKey(state.seasonEnd);
  return monthKey > max;
}

function fullDateA11y(localISO, zone){
  const [y,m,d] = localISO.split("-");
  const dateUTC = new Date(Date.UTC(parseInt(y,10), parseInt(m,10)-1, parseInt(d,10), 12));
  return new Intl.DateTimeFormat(undefined,{
    timeZone: zone,
    month:"long",
    day:"numeric",
    year:"numeric"
  }).format(dateUTC);
}

/* Events */
function initEvents(){
  document.getElementById("team-back")?.addEventListener("click", ()=>{
    clearHash();
    render();
  });

  document.getElementById("month-prev")?.addEventListener("click", ()=>{
    if (!state.selectedMonth) return;
    const prev = shiftMonth(state.selectedMonth,-1);
    if (isBeforeSeasonMonth(prev)) return;
    pushTeamHash(state.selectedTeam, prev);
  });
  document.getElementById("month-next")?.addEventListener("click", ()=>{
    if (!state.selectedMonth) return;
    const next = shiftMonth(state.selectedMonth,1);
    if (isAfterSeasonMonth(next)) return;
    pushTeamHash(state.selectedTeam, next);
  });
}

/* Timezone menu (share logic with date page) */
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
  rebuildTZMenu(menu);

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
      const selectedBtn = menu.querySelector('[data-selected="true"]')||menu.querySelector(".tz-option");
      selectedBtn?.focus({preventScroll:true});
    }
  }
}
function rebuildTZMenu(menu){
  menu.innerHTML = "";
  const localAbbr = deriveLocalAbbrev();
  TIMEZONE_OPTIONS.forEach(opt=>{
    const btn = document.createElement("button");
    btn.type="button";
    btn.className="tz-option";
    const selected = opt.key===state.selectedZone;
    btn.dataset.selected = selected? "true":"false";
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
        // Re-render calendar if open
        if (state.selectedTeam) renderTeamCalendar();
      }
      const trigger = document.getElementById("tz-trigger");
      trigger?.setAttribute("aria-expanded","false");
      menu.classList.remove("open");
      rebuildTZMenu(menu);
    });
    menu.appendChild(btn);
  });
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

/* Accessibility Live Region */
function announce(msg){
  const el = document.getElementById("announce");
  if (!el) return;
  el.textContent="";
  setTimeout(()=>{ el.textContent=msg; }, 20);
}
