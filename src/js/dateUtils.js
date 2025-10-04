// dateUtils.js - core date/time helpers for TipOffSchedule

export function parseUTC(isoString) {
  return new Date(isoString); // Date stores as UTC internally
}

export function toLocal(dateOrIso) {
  return dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
}

export function getLocalToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatTime24(dateObj) {
  const h = dateObj.getHours().toString().padStart(2, "0");
  const m = dateObj.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function sameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
}

export function dayKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const d = dateObj.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildContinuousDateArray(startDate, endDate) {
  const out = [];
  const cursor = new Date(startDate.getTime());
  while (cursor <= endDate) {
    out.push(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function utcMidnightFromLocal(localDate) {
  // localDate is local midnight. Convert to UTC ISO boundary.
  return new Date(Date.UTC(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate(),
    0, 0, 0, 0
  ));
}
