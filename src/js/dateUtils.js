// dateUtils.js – extended with timezone helpers

export function toLocal(utcString) {
  return new Date(utcString);
}

export function getLocalToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export function dayKey(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildContinuousDateArray(start, end) {
  const out = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function formatTime24(dateObj) {
  const h = dateObj.getHours().toString().padStart(2, "0");
  const m = dateObj.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/* --- Timezone utilities --- */

/**
 * Returns 'YYYY-MM-DD' representing the calendar day of the UTC instant in the given timeZone.
 * timeZone: IANA name (e.g. 'America/New_York'); if null, uses local system time.
 */
export function dateKeyInZone(utcISOString, timeZone) {
  const d = new Date(utcISOString);
  if (!timeZone) {
    return dayKey(d);
  }
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  // en-CA gives YYYY-MM-DD
  return fmt.format(d);
}

/**
 * Format a Date (UTC instant) into a time string in a target timezone (24h).
 * Returns { time: 'HH:MM', abbrev: 'EST' }
 */
export function formatTimeInZone(utcISOString, timeZone) {
  const d = new Date(utcISOString);
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timeZone || undefined
  });
  const time = fmt.format(d);

  const abbr = zoneAbbreviation(d, timeZone);
  return { time, abbr };
}

function zoneAbbreviation(dateObj, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: timeZone || undefined,
      timeZoneName: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).formatToParts(dateObj);
    const tz = parts.find(p => p.type === "timeZoneName");
    return tz ? tz.value : "";
  } catch {
    return "";
  }
}

/**
 * Create a stable Date object from a YYYY-MM-DD key for display formatting only.
 * Interprets key as UTC midnight so formatting with a timeZone is consistent.
 */
export function dateFromKeyUTC(key) {
  return new Date(key + "T00:00:00Z");
}
