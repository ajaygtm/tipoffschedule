/* Standings Page – loads data/standings.json and renders conference standings table */

const DATA_URL = "data/standings.json";

const TRI_ALIASES = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS"
};

const state = {
  data: null,
  conference: "eastern"
};

init().catch(err => {
  console.error("[StandingsPage] init error", err);
  showError("Failed to load standings data.");
});

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    showError("Standings data unavailable. Run <code>npm run update-standings</code> to fetch.");
    return;
  }

  attachConferenceSwitcher();
  renderTable();
}

function attachConferenceSwitcher() {
  const btnEast = document.getElementById("btn-eastern");
  const btnWest = document.getElementById("btn-western");
  if (!btnEast || !btnWest) return;

  btnEast.addEventListener("click", () => switchConference("eastern"));
  btnWest.addEventListener("click", () => switchConference("western"));
}

function switchConference(conf) {
  if (state.conference === conf) return;
  state.conference = conf;

  const btnEast = document.getElementById("btn-eastern");
  const btnWest = document.getElementById("btn-western");
  if (btnEast) {
    btnEast.classList.toggle("is-active", conf === "eastern");
    btnEast.setAttribute("aria-pressed", String(conf === "eastern"));
  }
  if (btnWest) {
    btnWest.classList.toggle("is-active", conf === "western");
    btnWest.setAttribute("aria-pressed", String(conf === "western"));
  }

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("standings-body");
  if (!tbody) return;

  const rows = (state.data && state.data[state.conference]) || [];
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="standings-empty">No data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => buildRow(row)).join("");

  const updated = state.data && state.data.updated;
  const updatedEl = document.getElementById("standings-updated");
  if (updatedEl && updated) {
    const d = new Date(updated);
    updatedEl.textContent = `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
}

function buildRow(row) {
  const streakClass = formatStreakClass(row.streak);
  const tri = normalizeTri(row.tri);

  return `<tr>
    <td class="col-rank">${row.rank}</td>
    <td class="col-team">
      <span class="team-cell">
        <span class="team-logo-wrap">
          <img class="team-logo" src="assets/logos/${tri}.svg" alt="${tri} logo"
               onerror="this.style.visibility='hidden'">
        </span>
        <span class="team-names">
          <span class="team-tri">${tri}</span>
          <span class="team-full">${escHtml(row.shortName)}</span>
        </span>
      </span>
    </td>
    <td class="col-num">${row.wins}</td>
    <td class="col-num">${row.losses}</td>
    <td class="col-num">${escHtml(row.pct)}</td>
    <td class="col-num">${escHtml(row.gb)}</td>
    <td class="col-str ${streakClass}">${escHtml(row.streak)}</td>
    <td class="col-num">${escHtml(row.l10)}</td>
  </tr>`;
}

function normalizeTri(value) {
  const clean = String(value || "").trim().toUpperCase();
  return TRI_ALIASES[clean] || clean;
}

function formatStreakClass(streak) {
  if (!streak || streak === "-") return "";
  return streak.startsWith("W") ? "streak-win" : "streak-loss";
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showError(msg) {
  const wrap = document.getElementById("standings-wrap");
  if (wrap) wrap.innerHTML = `<p class="standings-error">${msg}</p>`;
}
