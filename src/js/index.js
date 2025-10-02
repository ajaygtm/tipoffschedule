// TipOffSchedule - Initial Entry
// Placeholder: Real logic (loading schedule, rendering date strip, etc.) will be added in subsequent commits.

console.info("[TipOffSchedule] Initial scaffold loaded.");

(function initTimezoneLabel() {
  const tzLabel = document.getElementById("timezone-label");
  if (tzLabel) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local Time";
    tzLabel.textContent = tz;
  }
})();

// Temporary placeholder content:
const gameList = document.getElementById("game-list");
if (gameList) {
  const p = document.createElement("div");
  p.className = "no-games";
  p.textContent = "Schedule loading will appear here (next step).";
  gameList.appendChild(p);
}
