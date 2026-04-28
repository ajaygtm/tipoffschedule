import { formatTimeInZone } from "./dateUtils.js";
import { getPrettyZoneLabel } from "./timezoneLabels.js";

const BRACKET_URL = "data/playoffs_bracket.json";
const TZ_STORAGE_KEY = "tos_tz_pref";

const TIMEZONE_OPTIONS = [
  { key: "local", label: "MY TIMEZONE", zone: null, menuHint: "" },
  { key: "ET", label: "ET", zone: "America/New_York", menuHint: "(Eastern)" },
  { key: "CT", label: "CT", zone: "America/Chicago", menuHint: "(Central)" },
  { key: "PT", label: "PT", zone: "America/Los_Angeles", menuHint: "(Pacific)" }
];

const state = {
  data: null,
  conference: "east",
  selectedZone: "local",
  connectorFrame: null
};

init().catch(err => {
  console.error("[PlayoffsPage] init error", err);
  showError("Failed to load playoff bracket. Run npm run build-playoffs and refresh.");
});

async function init() {
  restoreTimezonePreference();
  state.data = await loadBracket();
  attachConferenceToggle();
  initTimezoneMenu();
  render();
  window.addEventListener("resize", scheduleConnectorRender, { passive: true });
}

async function loadBracket() {
  const cacheBustUrl = `${BRACKET_URL}?t=${Date.now()}`;
  const response = await fetch(cacheBustUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function render() {
  renderUpdatedLabel();
  renderBracket();
}

function renderUpdatedLabel() {
  const updatedEl = document.getElementById("playoffs-updated");
  if (!updatedEl || !state.data) return;
  const parts = [];

  if (state.data.generated_utc) {
    const d = new Date(state.data.generated_utc);
    parts.push(`Bracket built ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }
  if (state.data.source_scores_updated_utc) {
    const d = new Date(state.data.source_scores_updated_utc);
    parts.push(`Scores synced ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }

  updatedEl.textContent = parts.join(" • ");
}

function renderBracket() {
  const bracket = document.getElementById("playoff-bracket");
  const error = document.getElementById("playoff-error");
  if (!bracket) return;

  if (!state.data) {
    showError("Playoff bracket data unavailable.");
    return;
  }

  bracket.innerHTML = "";
  if (error) error.hidden = true;

  const conference = state.data.conferences[state.conference];
  if (!conference) {
    showError("Selected conference is unavailable.");
    return;
  }

  const board = document.createElement("div");
  board.className = "playoff-board";

  conference.rounds.forEach(round => {
    board.appendChild(createRoundColumn(round));
  });
  board.appendChild(createFinalsColumn(state.data.finals));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("playoff-board-svg");
  board.appendChild(svg);

  bracket.appendChild(board);
  scheduleConnectorRender();
}

function createBracketGroup(seriesList) {
  const group = document.createElement("div");
  group.className = "playoff-bracket-group";
  seriesList.forEach(function(series) {
    group.appendChild(createSeriesCard(series));
  });
  return group;
}

function createRoundColumn(round) {
  const column = document.createElement("section");
  column.className = "playoff-column";
  column.dataset.roundCount = String(round.series.length);

  const title = document.createElement("h4");
  title.className = "playoff-round-title";
  title.textContent = round.title;
  column.appendChild(title);

  if (round.series.length === 4) {
    // First round: two bracket groups of 2 (top pair feeds top semi, bottom pair feeds bottom semi)
    column.appendChild(createBracketGroup(round.series.slice(0, 2)));
    column.appendChild(createBracketGroup(round.series.slice(2, 4)));
  } else {
    // Semis (2 cards) or Conf Finals (1 card): each card in its own group
    round.series.forEach(function(series) {
      column.appendChild(createBracketGroup([series]));
    });
  }

  return column;
}

function createFinalsColumn(finals) {
  const column = document.createElement("section");
  column.className = "playoff-column playoff-column--finals playoff-finals-column";
  column.dataset.roundCount = "1";

  const title = document.createElement("h4");
  title.className = "playoff-round-title";
  title.textContent = finals.label || finals.title || "NBA Finals";
  column.appendChild(title);
  column.appendChild(createBracketGroup([finals]));
  return column;
}

function createSeriesCard(series) {
  const card = document.createElement("article");
  card.className = "playoff-series-card";
  card.dataset.seriesId = series.id;

  const statusClass = series.status === "completed"
    ? "is-complete"
    : series.status === "in-progress"
      ? "is-live"
      : series.status === "tbd"
        ? "is-tbd"
        : "";
  if (statusClass) card.classList.add(statusClass);

  const head = document.createElement("div");
  head.className = "playoff-series-head";

  const name = document.createElement("div");
  name.className = "playoff-series-name";
  name.textContent = series.title;
  head.appendChild(name);

  const badge = document.createElement("div");
  badge.className = `playoff-series-badge ${statusClass}`.trim();
  badge.textContent = seriesStatusLabel(series);
  head.appendChild(badge);
  card.appendChild(head);

  const participants = document.createElement("div");
  participants.className = "playoff-participants";
  const leaderIndex = leaderParticipantIndex(series);
  series.participants.forEach((participant, index) => {
    participants.appendChild(createTeamRow(participant, series.score, index, leaderIndex));
  });
  card.appendChild(participants);

  if (series.nextGame) {
    const next = document.createElement("div");
    next.className = "playoff-next-game";

    const label = document.createElement("div");
    label.className = "playoff-next-game-label";
    label.textContent = `Next up • ${series.nextGame.label || gameLabel(series.nextGame)}`;
    next.appendChild(label);

    const time = document.createElement("div");
    time.className = "playoff-next-game-time";
    time.textContent = formatScheduledTipoff(series.nextGame);
    next.appendChild(time);

    const meta = document.createElement("div");
    meta.className = "playoff-next-game-meta";
    meta.textContent = buildNextGameMeta(series.nextGame);
    next.appendChild(meta);

    card.appendChild(next);
  }

  if (Array.isArray(series.games) && series.games.length) {
    const strip = document.createElement("div");
    strip.className = "playoff-games-strip";
    series.games.forEach(game => strip.appendChild(createGameChip(game)));
    card.appendChild(strip);
  }

  const top = series.participants[0];
  const bottom = series.participants[1];
  const scoreText = `${series.score?.top ?? 0}-${series.score?.bottom ?? 0}`;
  card.setAttribute(
    "aria-label",
    `${top?.name || "TBD"} versus ${bottom?.name || "TBD"}. Series score ${scoreText}.`
  );
  return card;
}

function createTeamRow(participant, score, index, leaderIndex) {
  const row = document.createElement("div");
  row.className = "playoff-team-row";
  if (leaderIndex === index) row.classList.add("is-leading");

  const logo = createTeamLogo(participant);
  row.appendChild(logo);

  const meta = document.createElement("div");
  meta.className = "playoff-team-meta";

  const seed = document.createElement("span");
  seed.className = "playoff-team-seed";
  seed.textContent = participant.seed ? `#${participant.seed}` : "TBD";
  meta.appendChild(seed);

  const code = document.createElement("span");
  code.className = "playoff-team-code";
  code.textContent = participant.tri || "TBD";
  meta.appendChild(code);

  const name = document.createElement("span");
  name.className = "playoff-team-name";
  name.textContent = participant.placeholder && !participant.tri
    ? participant.placeholderLabel || participant.name || "TBD"
    : participant.name || participant.shortName || participant.tri || "TBD";
  meta.appendChild(name);

  row.appendChild(meta);

  const value = document.createElement("span");
  value.className = "playoff-team-score";
  if (leaderIndex === index) value.classList.add("is-leading");
  value.textContent = String(index === 0 ? score.top : score.bottom);
  row.appendChild(value);
  return row;
}

function createTeamLogo(participant) {
  if (participant?.tri) {
    const img = document.createElement("img");
    img.className = "playoff-team-logo";
    img.src = `assets/logos/${participant.tri}.svg`;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => {
      img.replaceWith(createTeamFallback(participant));
    };
    return img;
  }

  return createTeamFallback(participant);
}

function createTeamFallback(participant) {
  const fallback = document.createElement("div");
  fallback.className = "playoff-team-fallback";
  fallback.textContent = participant?.seed ? `#${participant.seed}` : "T";
  return fallback;
}

function createGameChip(game) {
  const chip = document.createElement("div");
  chip.className = "playoff-game-chip";
  if (game.status === "final") chip.classList.add("is-final");
  if (game.ifNecessary) chip.classList.add("is-if-needed");

  const bits = [game.label || gameLabel(game)];
  if (game.status === "final") {
    bits.push(`${game.away?.tri || "TBD"} ${game.awayScore}-${game.homeScore} ${game.home?.tri || "TBD"}`);
  } else if (String(game.statusText || "").toUpperCase() === "TBD") {
    bits.push("TBD");
  }
  chip.textContent = bits.join(" • ");
  return chip;
}

function attachConferenceToggle() {
  document.getElementById("conf-east")?.addEventListener("click", () => setConference("east"));
  document.getElementById("conf-west")?.addEventListener("click", () => setConference("west"));
}

function setConference(conference) {
  if (state.conference === conference) return;
  state.conference = conference;

  const east = document.getElementById("conf-east");
  const west = document.getElementById("conf-west");
  east?.classList.toggle("is-active", conference === "east");
  west?.classList.toggle("is-active", conference === "west");
  east?.setAttribute("aria-pressed", String(conference === "east"));
  west?.setAttribute("aria-pressed", String(conference === "west"));

  renderBracket();
  announce(`Showing ${conference === "east" ? "Eastern" : "Western"} Conference bracket.`);
}

function seriesStatusLabel(series) {
  if (series.status === "completed") return "Final";
  if (series.status === "in-progress") return "Live Series";
  if (series.status === "upcoming") return "Scheduled";
  return "TBD";
}

function leaderParticipantIndex(series) {
  if (series.score.top === series.score.bottom) return -1;
  return series.score.top > series.score.bottom ? 0 : 1;
}

function gameLabel(game) {
  return game.gameNumber ? `G${game.gameNumber}` : "Game";
}

function formatScheduledTipoff(game) {
  if (!game?.date_utc) return "TBD";
  const statusText = String(game.statusText || "").trim().toUpperCase();
  if (statusText === "TBD") {
    return `${formatDateShort(game.date_utc)} • TBD`;
  }

  const zoneId = currentZoneId();
  const dateText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: zoneId
  }).format(new Date(game.date_utc));
  const { time, abbr } = formatTimeInZone(game.date_utc, zoneId);
  const prettyZone = getPrettyZoneLabel(zoneId);
  return `${dateText} • ${time} ${(prettyZone || abbr || "").trim()}`.trim();
}

function buildNextGameMeta(game) {
  const meta = [];
  if (game.ifNecessary) meta.push("If necessary");
  if (game.tv) meta.push(game.tv);
  return meta.join(" • ") || "Awaiting tipoff details";
}

function formatDateShort(utc) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: currentZoneId()
  }).format(new Date(utc));
}

function scheduleConnectorRender() {
  if (state.connectorFrame) cancelAnimationFrame(state.connectorFrame);
  state.connectorFrame = requestAnimationFrame(renderConnectors);
}

function renderConnectors() {
  const board = document.querySelector(".playoff-board");
  const svg = board?.querySelector(".playoff-board-svg");
  if (!board || !svg) return;

  svg.innerHTML = "";
  if (window.innerWidth <= 1100) return;

  const conference = state.data?.conferences?.[state.conference];
  if (!conference) return;

  const boardRect = board.getBoundingClientRect();
  const boardOffsetX = board.getBoundingClientRect().left;
  const boardOffsetY = board.getBoundingClientRect().top;
  
  svg.setAttribute("viewBox", `0 0 ${Math.round(boardRect.width)} ${Math.round(boardRect.height)}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const connectors = [...conference.connectors, [conference.finalsSeriesId, state.data.finals.id]];
  connectors.forEach(([fromId, toId]) => {
    const fromEl = board.querySelector(`[data-series-id="${fromId}"]`);
    const toEl = board.querySelector(`[data-series-id="${toId}"]`);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const startX = fromRect.right - boardOffsetX;
    const startY = fromRect.top - boardOffsetY + fromRect.height / 2;
    const endX = toRect.left - boardOffsetX;
    const endY = toRect.top - boardOffsetY + toRect.height / 2;
    const midX = startX + (endX - startX) / 2;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`);
    svg.appendChild(path);
  });
}

function showError(message) {
  const error = document.getElementById("playoff-error");
  const bracket = document.getElementById("playoff-bracket");
  if (bracket) bracket.innerHTML = "";
  if (error) {
    error.hidden = false;
    error.textContent = message;
  }
}

function announce(message) {
  const el = document.getElementById("announce");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => {
    el.textContent = message;
  }, 20);
}

function restoreTimezonePreference() {
  try {
    const stored = localStorage.getItem(TZ_STORAGE_KEY);
    if (stored && TIMEZONE_OPTIONS.some(option => (option.zone || option.key) === stored || option.key === stored)) {
      const byZone = TIMEZONE_OPTIONS.find(option => option.zone === stored);
      state.selectedZone = byZone ? byZone.key : stored;
      return;
    }
  } catch {
    state.selectedZone = "local";
  }
}

function getSelectedTimezoneOption() {
  return TIMEZONE_OPTIONS.find(option => option.key === state.selectedZone) || TIMEZONE_OPTIONS[0];
}

function currentZoneId() {
  const option = getSelectedTimezoneOption();
  return option.zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function persistTimezonePreference() {
  try {
    const option = getSelectedTimezoneOption();
    localStorage.setItem(TZ_STORAGE_KEY, option.zone || option.key);
  } catch {
    // ignore storage failures
  }
}

function initTimezoneMenu() {
  const trigger = document.getElementById("tz-trigger");
  const menu = document.getElementById("tz-menu");
  if (!trigger || !menu) return;

  rebuildTimezoneMenu(menu, trigger);

  trigger.addEventListener("click", () => {
    const open = trigger.getAttribute("aria-expanded") === "true";
    setMenuOpen(!open, trigger, menu);
  });

  document.addEventListener("click", event => {
    if (!menu.contains(event.target) && event.target !== trigger) {
      setMenuOpen(false, trigger, menu);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setMenuOpen(false, trigger, menu);
    }
  });
}

function rebuildTimezoneMenu(menu, trigger) {
  menu.innerHTML = "";
  const localAbbr = deriveLocalAbbrev();

  TIMEZONE_OPTIONS.forEach(option => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tz-option";
    const selected = option.key === state.selectedZone;
    button.dataset.selected = selected ? "true" : "false";
    let label = option.label;
    if (option.key === "local" && localAbbr) label += ` (${localAbbr})`;
    if (option.menuHint) label += ` ${option.menuHint}`;
    button.textContent = label;
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", selected ? "true" : "false");
    button.addEventListener("click", () => {
      if (state.selectedZone !== option.key) {
        state.selectedZone = option.key;
        persistTimezonePreference();
        renderBracket();
      }
      setMenuOpen(false, trigger, menu);
      rebuildTimezoneMenu(menu, trigger);
    });
    menu.appendChild(button);
  });
}

function setMenuOpen(open, trigger, menu) {
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  menu.classList.toggle("open", open);
  if (open) {
    const selected = menu.querySelector('[data-selected="true"]');
    selected?.focus({ preventScroll: true });
  }
}

function deriveLocalAbbrev() {
  try {
    return getPrettyZoneLabel(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "UTC";
  }
}