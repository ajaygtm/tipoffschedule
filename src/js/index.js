import { loadSchedule } from "./scheduleLoader.js";
import { loadTeams, getTeamByTri } from "./teamsLoader.js";
import {
  dateKeyInZone,
  dateFromKeyUTC,
  formatTimeInZone
} from "./dateUtils.js";
import { getPrettyZoneLabel } from "./timezoneLabels.js";

/* Date View – global friendly timezone labels + US auto mapping + English-only labels */

const WINDOW_SIZE = 7;
const LOW_DENSITY_MAX = 4;
const HIGH_DENSITY_MIN = 10;
const COUNTDOWN_REFRESH_MS = 60_000;
const COUNTDOWN_MAX_FUTURE_HOURS = 48;

const TZ_STORAGE_KEY = "tos_tz_pref";

const TIMEZONE_OPTIONS = [
  { key: "local", label: "MY TIMEZONE", zone: null, menuHint: "" },
  { key: "ET", label: "ET", zone: "America/New_York", menuHint: "(Eastern)" },
  { key: "CT", label: "CT", zone: "America/Chicago", menuHint: "(Central)" },
  { key: "PT", label: "PT", zone: "America/Los_Angeles", menuHint: "(Pacific)" }
];

// US auto-map sets (expand as needed)
const EASTERN_ZONES = new Set([
  "America/New_York","America/Detroit","America/Toronto","America/Indiana/Indianapolis",
  "America/Indiana/Fort_Wayne","America/Indiana/Marengo","America/Indiana/Petersburg",
  "America/Indiana/Vevay","America/Indiana/Vincennes","America/Indiana/Winamac",
  "America/Kentucky/Louisville","America/Kentucky/Monticello"
]);
const CENTRAL_ZONES = new Set([
  "America/Chicago","America/Indiana/Knox","America/Indiana/Tell_City","America/Menominee",
  "America/North_Dakota/Beulah","America/North_Dakota/Center","America/North_Dakota/New_Salem",
  "America/Mexico_City"
]);
const PACIFIC_ZONES = new Set(["America/Los_Angeles","America/Vancouver"]);
function autoSelectUsZone(iana){
  if (EASTERN_ZONES.has(iana)) return "ET";
  if (CENTRAL_ZONES.has(iana)) return "CT";
  if (PACIFIC_ZONES.has(iana)) return "PT";
  return null;
}

const LIGHT_LOGO_TRIS = new Set(['BKN']);

const state = {
  schedule: null,
  teams: null,
  selectedZone: "local",
  zoneGameCache: {},
  currentDateKeys: [],
  selectedDateKey: null,
  countdownTimer: null
};

init().catch(e=>{
  console.error(e);
  showError("Failed to initialize.");
});

/* -------------------- Init -------------------- */
async function init() {
  restoreTimezonePreference();
  await loadData();
  validateDates();
  buildTimezoneIndexIfNeeded(state.selectedZone);
  pickInitialDateKey();
  attachWindowNav();
  initTimezoneMenu();
  renderDateStrip();
  renderGamesForSelectedDate();
  startCountdownLoop();
}

async function loadData(){
  const [schedule, teams] = await Promise.all([loadSchedule(), loadTeams()]);
  state.schedule = schedule;
  state.teams = teams;
}

function validateDates(){
  if (!state.schedule?.games) return;
  for (const g of state.schedule.games){
    if (!g.date_utc || isNaN(Date.parse(g.date_utc))){
      throw new Error("Invalid date_utc in schedule");
    }
  }
}

/* -------------------- Timezone logic -------------------- */
function restoreTimezonePreference(){
  try {
    const stored = localStorage.getItem(TZ_STORAGE_KEY);
    if (stored && TIMEZONE_OPTIONS.some(o => (o.zone||o.key)===stored || o.key===stored)){
      const byZone = TIMEZONE_OPTIONS.find(o => o.zone===stored);
      state.selectedZone = byZone ? byZone.key : stored;
      return;
    }
    const sys = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const mapped = autoSelectUsZone(sys);
    state.selectedZone = mapped ? mapped : "local";
  } catch {
    state.selectedZone = "local";
  }
}
function persistTimezonePreference(){
  try {
    const opt = getSelectedTzOption();
    localStorage.setItem(TZ_STORAGE_KEY, opt.zone || opt.key);
  } catch {}
}
function getSelectedTzOption(){
  return TIMEZONE_OPTIONS.find(o=>o.key===state.selectedZone)||TIMEZONE_OPTIONS[0];
}
function currentZoneId(){
  const opt = getSelectedTzOption();
  return opt.zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function buildTimezoneIndexIfNeeded(zoneKey){
  if (state.zoneGameCache[zoneKey]){
    state.currentDateKeys = state.zoneGameCache[zoneKey].dateKeys;
    return;
  }
  const opt = TIMEZONE_OPTIONS.find(o=>o.key===zoneKey);
  const zone = opt? opt.zone : null;
  const map = new Map();
  for (const g of state.schedule.games){
    const key = dateKeyInZone(g.date_utc, zone);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  for (const arr of map.values()){
    arr.sort((a,b)=>a.date_utc.localeCompare(b.date_utc));
  }
  const dateKeys = Array.from(map.keys()).sort();
  state.zoneGameCache[zoneKey] = { map, dateKeys };
  state.currentDateKeys = dateKeys;
}
function pickInitialDateKey(){
  const zone = currentZoneId();
  const todayKey = dateKeyInZone(new Date().toISOString(), zone);
  state.selectedDateKey = state.currentDateKeys.includes(todayKey)
    ? todayKey
    : state.currentDateKeys[0] || null;
}

/* -------------------- Date strip -------------------- */
function renderDateStrip(){
  const strip = document.getElementById("date-strip");
  strip.innerHTML = "";
  if (!state.selectedDateKey) return;
  const windowKeys = computeWindowKeys(state.selectedDateKey);
  windowKeys.forEach(key=>{
    const btn = document.createElement("button");
    btn.className = "date-pill";
    const zone = currentZoneId();
    const dateObj = dateFromKeyUTC(key);
    const monthStr = new Intl.DateTimeFormat("en-US",{month:"short", timeZone:zone}).format(dateObj);
    const dayNum   = new Intl.DateTimeFormat("en-US",{day:"numeric", timeZone:zone}).format(dateObj);
    const weekday  = new Intl.DateTimeFormat("en-US",{weekday:"long", timeZone:zone}).format(dateObj);
    const weekdayShort = new Intl.DateTimeFormat("en-US",{weekday:"short", timeZone:zone}).format(dateObj);
    if (weekdayShort==="Sun") btn.classList.add("sunday");
    const localTodayKey = dateKeyInZone(new Date().toISOString(), null);
    if (key===localTodayKey) btn.classList.add("today");

    btn.innerHTML = `<span class="dom">${monthStr} ${dayNum}</span><span class="dow">${weekday}</span>`;
    btn.setAttribute("role","tab");
    btn.setAttribute("aria-selected", key===state.selectedDateKey ? "true":"false");
    btn.addEventListener("click", ()=>{
      state.selectedDateKey = key;
      renderDateStrip();
      renderGamesForSelectedDate();
      updateCountdowns();
    });
    strip.appendChild(btn);
  });
}
function computeWindowKeys(centerKey){
  const keys = state.currentDateKeys;
  const idx = keys.indexOf(centerKey);
  if (idx===-1) return [];
  const half = Math.floor(WINDOW_SIZE/2);
  let start=idx-half;
  let end=idx+half;
  if (start<0){ end += -start; start=0; }
  if (end>=keys.length){
    const over = end-(keys.length-1);
    start = Math.max(0, start-over);
    end = keys.length-1;
  }
  return keys.slice(start,end+1);
}

/* -------------------- Games list -------------------- */
function renderGamesForSelectedDate(){
  const list = document.getElementById("game-list");
  list.classList.remove("ready");
  list.innerHTML = "";
  if (!state.selectedDateKey){
    showNoGames("No games loaded.");
    return;
  }
  const zoneData = state.zoneGameCache[state.selectedZone];
  const games = zoneData?.map.get(state.selectedDateKey) || [];

  list.classList.remove("density-low","density-high");
  if (games.length <= LOW_DENSITY_MAX) list.classList.add("density-low");
  else if (games.length >= HIGH_DENSITY_MIN) list.classList.add("density-high");

  if (!games.length){
    showNoGames("No games on this date.");
    return;
  }
  for (const g of games){
    list.appendChild(renderGameCard(g));
  }
  requestAnimationFrame(()=>list.classList.add("ready"));
  updateCountdowns();
}
function showNoGames(msg){
  const list = document.getElementById("game-list");
  const div = document.createElement("div");
  div.className = "no-games";
  div.textContent = msg;
  list.appendChild(div);
  requestAnimationFrame(()=>list.classList.add("ready"));
}

function renderGameCard(game){
  const card = document.createElement("div");
  card.className = "game-card";
  card.setAttribute("data-tipoff", game.date_utc);

  const logos = document.createElement("div");
  logos.className = "logos-row";
  logos.appendChild(createLogo(game.away_tri));
  logos.appendChild(createLogo(game.home_tri));

  const matchup = document.createElement("div");
  matchup.className = "matchup";
  matchup.textContent = `${game.away_tri} @ ${game.home_tri}`;

  const countdown = document.createElement("div");
  countdown.className = "countdown-line";
  countdown.style.display = "none";

  const metaBlock = document.createElement("div");
  metaBlock.className = "meta-block";

  const seasonLine = document.createElement("div");
  seasonLine.className = "meta-line season-line";
  seasonLine.textContent = game.season_stage || "Regular Season";

  const venueLine = document.createElement("div");
  venueLine.className = "meta-line venue-line";
  venueLine.textContent = game.venue || "";

  const timeLine = document.createElement("div");
  timeLine.className = "meta-line time-line";
  const zoneId = currentZoneId();
  const { time, abbr } = formatTimeInZone(game.date_utc, zoneId);
  // Prefer our pretty label first (fixes Chrome Sensors returning generic GMT+ offsets)
  const zonePretty = getPrettyZoneLabel(zoneId);
  const displayAbbr = zonePretty || abbr || "";
  timeLine.textContent = `${time} ${displayAbbr}`.trim();

  metaBlock.appendChild(seasonLine);
  metaBlock.appendChild(venueLine);
  metaBlock.appendChild(timeLine);

  const awayName = getTeamByTri(game.away_tri)?.name || game.away_tri;
  const homeName = getTeamByTri(game.home_tri)?.name || game.home_tri;
  card.setAttribute("aria-label",
    `${awayName} at ${homeName}${game.venue? " in " + game.venue:""}, ${time} ${displayAbbr}`);

  card.appendChild(logos);
  card.appendChild(matchup);
  card.appendChild(countdown);
  card.appendChild(metaBlock);
  return card;
}

function createLogo(tri){
  const img = document.createElement("img");
  img.className = "logo";
  if (LIGHT_LOGO_TRIS.has(tri)) img.classList.add("logo--contrast");
  img.alt = `${tri} logo`;
  img.src = `assets/logos/${tri}.svg`;
  img.loading = "lazy";
  img.decoding = "async";
  img.onerror = () => {
    const span = document.createElement("div");
    span.className = "tri-fallback";
    span.textContent = tri;
    img.replaceWith(span);
  };
  return img;
}

/* -------------------- Countdown -------------------- */
function startCountdownLoop(){
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(updateCountdowns, COUNTDOWN_REFRESH_MS);
  updateCountdowns();
}
function updateCountdowns(){
  const now = Date.now();
  document.querySelectorAll("[data-tipoff]").forEach(card=>{
    const iso = card.getAttribute("data-tipoff");
    const ts = Date.parse(iso);
    if (isNaN(ts)) return;
    const diffMs = ts - now;
    const el = card.querySelector(".countdown-line");
    if (!el) return;
    if (diffMs <= 0){ el.style.display="none"; return; }
    const diffH = diffMs / 3_600_000;
    if (diffH > COUNTDOWN_MAX_FUTURE_HOURS){ el.style.display="none"; return; }

    if (diffH >= 24){
      const d = Math.floor(diffH/24);
      el.textContent = `in ${d}d`;
    } else if (diffH >= 1){
      const h = Math.floor(diffH);
      const m = Math.round((diffH - h)*60);
      el.textContent = `in ${h}h ${m}m`;
    } else {
      const m = Math.max(1, Math.round(diffMs/60000));
      el.textContent = `in ${m}m`;
    }
    el.style.display="";
  });
}

/* -------------------- Navigation -------------------- */
function attachWindowNav(){
  document.getElementById("date-prev")?.addEventListener("click",()=>shiftWindow(-1));
  document.getElementById("date-next")?.addEventListener("click",()=>shiftWindow(1));
  window.addEventListener("keydown", e=>{
    if (e.key==="ArrowLeft") shiftWindow(-1);
    if (e.key==="ArrowRight") shiftWindow(1);
  });
}
function shiftWindow(direction){
  if (!state.selectedDateKey) return;
  const keys = state.currentDateKeys;
  const idx = keys.indexOf(state.selectedDateKey);
  if (idx===-1) return;
  const target = idx + direction;
  if (target<0 || target>=keys.length) return;
  state.selectedDateKey = keys[target];
  renderDateStrip();
  renderGamesForSelectedDate();
  updateCountdowns();
}

/* -------------------- Timezone menu -------------------- */
function initTimezoneMenu(){
  const trigger = document.getElementById("tz-trigger");
  const menu = document.getElementById("tz-menu");
  if (!trigger || !menu) return;
  buildTimezoneMenu(menu);

  trigger.addEventListener("click", ()=>{
    const expanded = trigger.getAttribute("aria-expanded")==="true";
    setMenuOpen(!expanded);
  });
  document.addEventListener("click", e=>{
    if (!menu.contains(e.target) && e.target!==trigger) setMenuOpen(false);
  });
  document.addEventListener("keydown", e=>{
    if (e.key==="Escape") setMenuOpen(false);
  });

  function setMenuOpen(open){
    trigger.setAttribute("aria-expanded", open?"true":"false");
    menu.classList.toggle("open", open);
    if (open){
      const selectedBtn = menu.querySelector('[data-selected="true"]')||menu.querySelector(".tz-option");
      selectedBtn?.focus({preventScroll:true});
    }
  }
}

function buildTimezoneMenu(menu){
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
        buildTimezoneIndexIfNeeded(opt.key);
        if (!state.currentDateKeys.includes(state.selectedDateKey)){
          pickInitialDateKey();
        }
        renderDateStrip();
        renderGamesForSelectedDate();
        updateCountdowns();
      }
      const trigger = document.getElementById("tz-trigger");
      trigger?.setAttribute("aria-expanded","false");
      menu.classList.remove("open");
      buildTimezoneMenu(menu);
    });
    menu.appendChild(btn);
  });
}

function deriveLocalAbbrev(){
  try{
    const sys = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return getPrettyZoneLabel(sys);
  }catch{
    return "UTC";
  }
}

/* -------------------- Errors -------------------- */
function showError(msg){
  const list = document.getElementById("game-list");
  if (list){
    list.innerHTML="";
    const div=document.createElement("div");
    div.className="no-games";
    div.textContent=msg;
    list.appendChild(div);
  }
}
