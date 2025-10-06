import { loadSchedule } from "./scheduleLoader.js";
import { loadTeams } from "./teamsLoader.js";

const TZ_STORAGE_KEY = "tos_tz_pref";
const TIMEZONE_OPTIONS = [
  { key:"local", label:"MY TIMEZONE", zone:null, menuHint:"" },
  { key:"ET", label:"ET", zone:"America/New_York", menuHint:"(Eastern)" },
  { key:"PT", label:"PT", zone:"America/Los_Angeles", menuHint:"(Pacific)" },
  { key:"CT", label:"CT", zone:"America/Chicago", menuHint:"(Central)" }
];

// Canonical 30 NBA tri codes + canonical names (can refine naming later)
const MASTER_TEAMS = [
  ["ATL","Atlanta Hawks"],
  ["BOS","Boston Celtics"],
  ["BKN","Brooklyn Nets"],
  ["CHA","Charlotte Hornets"],
  ["CHI","Chicago Bulls"],
  ["CLE","Cleveland Cavaliers"],
  ["DAL","Dallas Mavericks"],
  ["DEN","Denver Nuggets"],
  ["DET","Detroit Pistons"],
  ["GSW","Golden State Warriors"],
  ["HOU","Houston Rockets"],
  ["IND","Indiana Pacers"],
  ["LAC","LA Clippers"],
  ["LAL","Los Angeles Lakers"],
  ["MEM","Memphis Grizzlies"],
  ["MIA","Miami Heat"],
  ["MIL","Milwaukee Bucks"],
  ["MIN","Minnesota Timberwolves"],
  ["NOP","New Orleans Pelicans"],
  ["NYK","New York Knicks"],
  ["OKC","Oklahoma City Thunder"],
  ["ORL","Orlando Magic"],
  ["PHI","Philadelphia 76ers"],
  ["PHX","Phoenix Suns"],
  ["POR","Portland Trail Blazers"],
  ["SAC","Sacramento Kings"],
  ["SAS","San Antonio Spurs"],
  ["TOR","Toronto Raptors"],
  ["UTA","Utah Jazz"],
  ["WAS","Washington Wizards"]
];

// Legacy alias map if raw data / teams loader ever uses alternates
const ALIASES = { CHO: "CHA" };

const state = {
  teams: [],
  selectedZone: "local"
};

init().catch(err=>{
  console.error("[TeamSelector] init error", err);
  announce("Failed to load data.");
});

async function init(){
  restoreTimezonePreference();
  // Load schedule just to ensure consistent fetch (not strictly needed here)
  await Promise.all([loadSchedule(), loadTeams()]).then(([_, teams])=>{
    state.teams = Array.isArray(teams) ? teams : [];
  });
  const normalized = buildFullTeamList(state.teams);
  state.teams = normalized;
  renderTeamGrid();
  initTimezoneMenu();
}

function buildFullTeamList(rawTeams){
  const byTri = new Map();
  rawTeams.forEach(t=>{
    const tri = (t.triCode || t.tri || t.teamTricode || "").toUpperCase();
    if (!tri) return;
    const canonical = ALIASES[tri] || tri;
    if (!byTri.has(canonical)) {
      byTri.set(canonical, {
        triCode: canonical,
        name: t.name || t.fullName || t.teamName || canonical
      });
    }
  });
  // Ensure all master tri codes exist
  MASTER_TEAMS.forEach(([tri, fullName])=>{
    if (!byTri.has(tri)) {
      byTri.set(tri, { triCode: tri, name: fullName });
    }
  });
  // Return sorted by tri
  return Array.from(byTri.values()).sort((a,b)=>a.triCode.localeCompare(b.triCode));
}

function renderTeamGrid(){
  const grid = document.getElementById("team-grid");
  grid.innerHTML = "";
  state.teams.forEach(t=>{
    const tri = t.triCode;
    const btn = document.createElement("button");
    btn.type="button";
    btn.className="team-tile";
    btn.dataset.team=tri;
    btn.setAttribute("aria-label", `${t.name} (${tri})`);

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
      window.location.href = `team.html?team=${encodeURIComponent(tri)}`;
    });

    grid.appendChild(btn);
  });
}

function announce(msg){
  const el = document.getElementById("announce");
  if (!el) return;
  el.textContent="";
  setTimeout(()=>{ el.textContent=msg; }, 25);
}

/* Timezone menu */
function restoreTimezonePreference(){
  try{
    const stored = localStorage.getItem(TZ_STORAGE_KEY);
    if (stored && TIMEZONE_OPTIONS.some(o=>(o.zone||o.key)===stored || o.key===stored)){
      const byZone = TIMEZONE_OPTIONS.find(o=>o.zone===stored);
      state.selectedZone = byZone ? byZone.key : stored;
    }
  }catch{}
}

function initTimezoneMenu(){
  const trigger = document.getElementById("tz-trigger");
  const menu = document.getElementById("tz-menu");
  if (!trigger || !menu) return;
  buildMenu(menu);

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
}

function buildMenu(menu){
  menu.innerHTML = "";
  const localAbbr = deriveLocalAbbrev();
  TIMEZONE_OPTIONS.forEach(opt=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="tz-option";
    const selected = opt.key===state.selectedZone;
    btn.dataset.selected = selected?"true":"false";
    let txt = opt.label;
    if (opt.key==="local" && localAbbr) txt += ` (${localAbbr})`;
    if (opt.menuHint) txt += ` ${opt.menuHint}`;
    btn.textContent = txt;
    btn.setAttribute("role","menuitemradio");
    btn.setAttribute("aria-checked", selected?"true":"false");
    btn.addEventListener("click", ()=>{
      if (state.selectedZone !== opt.key){
        state.selectedZone = opt.key;
        try {
          const zoneVal = opt.zone || opt.key;
          localStorage.setItem(TZ_STORAGE_KEY, zoneVal);
        } catch {}
      }
      const trigger = document.getElementById("tz-trigger");
      trigger?.setAttribute("aria-expanded","false");
      menu.classList.remove("open");
      buildMenu(menu);
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
