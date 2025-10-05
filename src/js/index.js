import { loadSchedule, getGamesByDate, findScheduleDateBounds } from "./scheduleLoader.js";
import { loadTeams, getTeamByTri } from "./teamsLoader.js";
import {
  toLocal,
  buildContinuousDateArray,
  formatTime24,
  sameDay,
  dayKey,
  getLocalToday
} from "./dateUtils.js";

/* Config */
const WINDOW_SIZE = 7;
const USE_24H_TIME = true;
const LOW_DENSITY_MAX = 4;
const HIGH_DENSITY_MIN = 10;
const COUNTDOWN_REFRESH_MS = 60_000;
const COUNTDOWN_MAX_FUTURE_HOURS = 48;

/* Add light logos (white-dominant) here for shadow contrast */
const LIGHT_LOGO_TRIS = new Set([
  'BKN'
]);

const state = {
  schedule: null,
  teams: null,
  gamesByUtcDate: null,
  fullDateRange: [],
  selectedDate: null,
  windowDates: [],
  countdownTimer: null
};

init().catch(err => {
  console.error("[TipOffSchedule] Init error:", err);
  showError("Failed to initialize.");
});

async function init() {
  await loadData();
  validateDates();
  buildFullDateRange();
  pickInitialDate();
  computeWindowFor(state.selectedDate);
  renderDateStrip();
  renderGamesForSelectedDate();
  attachWindowNav();
  startCountdownLoop();
  detectDuplicateLoad();
}

async function loadData() {
  const [schedule, teams] = await Promise.all([loadSchedule(), loadTeams()]);
  state.schedule = schedule;
  state.teams = teams;
  state.gamesByUtcDate = getGamesByDate(schedule);
}

function validateDates() {
  if (!state.schedule?.games) return;
  const bad = [];
  for (const g of state.schedule.games) {
    if (!g.date_utc || isNaN(Date.parse(g.date_utc))) bad.push(g.game_id);
  }
  if (bad.length) {
    console.error("Invalid date_utc values:", bad);
    throw new Error("Invalid date strings in schedule JSON.");
  }
}

function buildFullDateRange() {
  const bounds = findScheduleDateBounds(state.schedule);
  if (!bounds) return;
  const startLocal = toLocal(bounds.start);
  const endLocal = toLocal(bounds.end);
  state.fullDateRange = buildContinuousDateArray(startLocal, endLocal);
}

function pickInitialDate() {
  const today = getLocalToday();
  const match = state.fullDateRange.find(d => sameDay(d, today));
  state.selectedDate = match || state.fullDateRange[0] || today;
}

function computeWindowFor(centerDate) {
  if (!state.fullDateRange.length) { state.windowDates = []; return; }
  const idx = state.fullDateRange.findIndex(d => sameDay(d, centerDate));
  if (idx === -1) { state.windowDates = []; return; }
  const half = Math.floor(WINDOW_SIZE / 2);
  let start = idx - half;
  let end = idx + half;
  if (start < 0) { end += -start; start = 0; }
  if (end >= state.fullDateRange.length) {
    const over = end - (state.fullDateRange.length - 1);
    start = Math.max(0, start - over);
    end = state.fullDateRange.length - 1;
  }
  state.windowDates = state.fullDateRange.slice(start, end + 1);
}

function attachWindowNav() {
  document.getElementById("date-prev")?.addEventListener("click", () => shiftWindow(-1));
  document.getElementById("date-next")?.addEventListener("click", () => shiftWindow(1));
  window.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") shiftWindow(-1);
    if (e.key === "ArrowRight") shiftWindow(1);
  });
}

function shiftWindow(direction) {
  if (!state.selectedDate) return;
  const idx = state.fullDateRange.findIndex(d => sameDay(d, state.selectedDate));
  if (idx === -1) return;
  const target = idx + direction;
  if (target < 0 || target >= state.fullDateRange.length) return;
  state.selectedDate = state.fullDateRange[target];
  computeWindowFor(state.selectedDate);
  renderDateStrip();
  renderGamesForSelectedDate();
  updateCountdowns();
}

function renderDateStrip() {
  const strip = document.getElementById("date-strip");
  strip.innerHTML = "";
  state.windowDates.forEach(d => {
    const pill = document.createElement("button");
    pill.className = "date-pill";
    if (d.getDay() === 0) pill.classList.add("sunday");
    if (sameDay(d, getLocalToday())) pill.classList.add("today");

    const month = d.toLocaleString(undefined, { month: "short" });
    pill.innerHTML = `
      <span class="dom">${month} ${d.getDate()}</span>
      <span class="dow">${d.toLocaleString(undefined, { weekday: "long" })}</span>
    `;
    pill.dataset.dateKey = dayKey(d);
    pill.setAttribute("role", "tab");
    pill.setAttribute("aria-selected", sameDay(d, state.selectedDate) ? "true" : "false");
    pill.addEventListener("click", () => {
      state.selectedDate = d;
      computeWindowFor(d);
      renderDateStrip();
      renderGamesForSelectedDate();
      updateCountdowns();
    });
    strip.appendChild(pill);
  });
}

function renderGamesForSelectedDate() {
  const list = document.getElementById("game-list");
  list.classList.remove("ready");
  list.innerHTML = "";

  if (!state.selectedDate || !state.schedule?.games?.length) {
    showNoGames("No games loaded.");
    return;
  }

  const games = state.schedule.games.filter(g => {
    const local = toLocal(g.date_utc);
    return sameDay(local, state.selectedDate);
  });

  list.classList.remove("density-low", "density-high");
  if (games.length <= LOW_DENSITY_MAX) list.classList.add("density-low");
  else if (games.length >= HIGH_DENSITY_MIN) list.classList.add("density-high");

  if (!games.length) {
    showNoGames("No games on this date.");
    return;
  }

  for (const g of games) list.appendChild(renderGameCard(g));
  requestAnimationFrame(() => list.classList.add("ready"));
  updateCountdowns();
}

function showNoGames(message) {
  const list = document.getElementById("game-list");
  const div = document.createElement("div");
  div.className = "no-games";
  div.textContent = message;
  list.appendChild(div);
  requestAnimationFrame(() => list.classList.add("ready"));
}

function renderGameCard(game) {
  const localDate = toLocal(game.date_utc);
  const card = document.createElement("div");
  card.className = "game-card";
  card.setAttribute("data-tipoff", game.date_utc);

  const logos = document.createElement("div");
  logos.className = "logos-row";
  logos.appendChild(createLogoElement(game.away_tri));
  logos.appendChild(createLogoElement(game.home_tri));

  const matchup = document.createElement("div");
  matchup.className = "matchup";
  matchup.textContent = `${game.away_tri} @ ${game.home_tri}`;

  if (game.venue) {
    const venue = document.createElement("div");
    venue.className = "venue-line";
    venue.textContent = game.venue;
    matchup.after(venue);
  }

  const countdownLine = document.createElement("div");
  countdownLine.className = "countdown-line";
  countdownLine.style.display = "none";

  const timeEl = document.createElement("div");
  timeEl.className = "time-line";
  timeEl.textContent = timeDisplay(localDate);

  const awayTeam = getTeamByTri(game.away_tri);
  const homeTeam = getTeamByTri(game.home_tri);
  const fullAway = awayTeam ? awayTeam.name : game.away_tri;
  const fullHome = homeTeam ? homeTeam.name : game.home_tri;
  const ariaTime = localDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !USE_24H_TIME
  });

  card.setAttribute(
    "aria-label",
    `${fullAway} at ${fullHome}${game.venue ? " in " + game.venue : ""}, ${ariaTime} ${getShortTimeZone()}`
  );

  card.appendChild(logos);
  card.appendChild(matchup);
  card.appendChild(countdownLine);
  card.appendChild(timeEl);
  return card;
}

function createLogoElement(tri) {
  const img = document.createElement("img");
  img.className = "logo";
  if (LIGHT_LOGO_TRIS.has(tri)) img.classList.add("logo--contrast");
  img.alt = `${tri} logo`;
  img.src = `assets/logos/${tri}.svg`;
  img.decoding = "async";
  img.loading = "lazy";
  img.onerror = () => {
    // Fallback text if SVG missing
    const span = document.createElement("div");
    span.className = "tri-fallback";
    span.textContent = tri;
    img.replaceWith(span);
  };
  return img;
}

function startCountdownLoop() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(updateCountdowns, COUNTDOWN_REFRESH_MS);
  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now();
  const today = getLocalToday();
  const tomorrow = new Date(today.getTime());
  tomorrow.setDate(today.getDate() + 1);

  document.querySelectorAll("[data-tipoff]").forEach(card => {
    const iso = card.getAttribute("data-tipoff");
    const ts = Date.parse(iso);
    if (isNaN(ts)) return;
    const diffMs = ts - now;
    const el = card.querySelector(".countdown-line");
    if (!el) return;

    const localGame = toLocal(iso);
    const isToday = sameDay(localGame, today);
    const isTomorrow = sameDay(localGame, tomorrow);

    if (!isToday && !isTomorrow) {
      el.style.display = "none";
      return;
    }
    if (diffMs <= 0) { el.style.display = "none"; return; }

    const diffH = diffMs / 3_600_000;
    if (diffH > COUNTDOWN_MAX_FUTURE_HOURS) { el.style.display = "none"; return; }

    if (isTomorrow && diffH >= 24) {
      el.textContent = "in 1d";
      el.style.display = "";
      return;
    }
    if (diffH >= 1) {
      const h = Math.floor(diffH);
      const m = Math.round((diffH - h) * 60);
      el.textContent = `in ${h}h ${m}m`;
    } else {
      const m = Math.max(1, Math.round(diffMs / 60000));
      el.textContent = `in ${m}m`;
    }
    el.style.display = "";
  });
}

function timeDisplay(dateObj) {
  if (USE_24H_TIME) return `${formatTime24(dateObj)} ${getShortTimeZone()}`;
  return `${dateObj.toLocaleTimeString(undefined,
    { hour:"numeric", minute:"2-digit", hour12:true }).replace(" ","")} ${getShortTimeZone()}`;
}

function getShortTimeZone() {
  try {
    const dtf = new Intl.DateTimeFormat(undefined, { timeZoneName:"short" });
    const parts = dtf.formatToParts(new Date());
    const tz = parts.find(p => p.type === "timeZoneName");
    return tz ? tz.value : Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

function showError(msg) {
  const list = document.getElementById("game-list");
  if (list) {
    list.innerHTML = "";
    const div = document.createElement("div");
    div.className = "no-games";
    div.textContent = msg;
    list.appendChild(div);
    requestAnimationFrame(()=>list.classList.add("ready"));
  }
  const strip = document.getElementById("date-strip");
  if (strip) strip.innerHTML = "";
}

function detectDuplicateLoad() {
  if (window.__tipoffschedule_loaded) {
    console.warn("[TipOffSchedule] index.js loaded twice.");
  }
  window.__tipoffschedule_loaded = true;
}
