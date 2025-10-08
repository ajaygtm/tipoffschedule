// Friendly timezone abbreviations + DST-aware labels + clean fallbacks.
//
// getPrettyZoneLabel(iana) -> returns a short, human-friendly code.
// Uses:
//  - STATIC_LABELS for fixed mappings
//  - DST_SWAPPERS for zones where we want STD vs DST codes
//  - Fallback: "UTC±HH:MM"
//
// NOTE: We do a light DST detection by comparing offsets in Jan & Jul.

const STATIC_LABELS = {
  // North America (fixed codes we prefer)
  "America/New_York": "ET",
  "America/Detroit": "ET",
  "America/Toronto": "ET",
  "America/Chicago": "CT",
  "America/Mexico_City": "CT",
  "America/Denver": "MT",
  "America/Phoenix": "MT",   // no DST, keep MT for simplicity
  "America/Los_Angeles": "PT",
  "America/Vancouver": "PT",

  // Asia
  "Asia/Kolkata": "IST",
  "Asia/Tokyo": "JST",
  "Asia/Seoul": "KST",
  "Asia/Shanghai": "CST",    // China Standard (not US Central)
  "Asia/Singapore": "SGT",
  "Asia/Bangkok": "ICT",
  "Asia/Dubai": "GST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Jakarta": "WIB",
  "Asia/Manila": "PHT",

  // Middle East / Europe (some handled by DST_SWAPPERS)
  "Europe/Moscow": "MSK",
  "Europe/Istanbul": "TRT",

  // Oceania
  "Pacific/Honolulu": "HST",
  "Pacific/Auckland": "NZST"  // NZDT via DST_SWAPPERS
};

// Zones where we want to show different STD vs DST codes
const DST_SWAPPERS = {
  "Europe/London": { std: "GMT",  dst: "BST" },
  "Europe/Paris":  { std: "CET",  dst: "CEST" },
  "Europe/Berlin": { std: "CET",  dst: "CEST" },
  "Europe/Madrid": { std: "CET",  dst: "CEST" },
  "Europe/Rome":   { std: "CET",  dst: "CEST" },
  "Europe/Amsterdam": { std: "CET", dst: "CEST" },
  "Europe/Brussels":  { std: "CET", dst: "CEST" },
  "Europe/Stockholm": { std: "CET", dst: "CEST" },
  "Europe/Warsaw":    { std: "CET", dst: "CEST" },
  "Europe/Athens": { std: "EET", dst: "EEST" },
  "Europe/Bucharest": { std: "EET", dst: "EEST" },
  "Europe/Helsinki":  { std: "EET", dst: "EEST" },
  "Pacific/Auckland": { std: "NZST", dst: "NZDT" },
  "Australia/Sydney": { std: "AEST", dst: "AEDT" },
  "Australia/Melbourne": { std: "AEST", dst: "AEDT" },
  "Australia/Brisbane": { std: "AEST", dst: "AEST" }, // no DST
  "Australia/Perth":    { std: "AWST", dst: "AWST" }
};

// Detect DST by comparing current offset to the greater (std) of Jan/Jul
function isDstActive(tz) {
  try {
    const year = new Date().getUTCFullYear();
    const jan = new Date(Date.UTC(year, 0, 1, 12));
    const jul = new Date(Date.UTC(year, 6, 1, 12));
    const now = new Date();

    const offNow = offsetMinutes(now, tz);
    const offJan = offsetMinutes(jan, tz);
    const offJul = offsetMinutes(jul, tz);

    const stdOffset = Math.max(offJan, offJul); // DST usually has smaller (more negative) offset
    return offNow < stdOffset;
  } catch {
    return false;
  }
}

// Return timezone offset in minutes (similar sign convention as Date.getTimezoneOffset)
function offsetMinutes(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    timeZoneName: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const parts = fmt.formatToParts(date);
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "";
  const m = tzPart.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    return -(h * 60 + Math.sign(h) * mm);
  }
  // fallback approximate
  const utc = date.getTime();
  const localString = date.toLocaleString("en-US", { timeZone: tz });
  const asLocal = new Date(localString);
  return (utc - asLocal.getTime()) / 60000;
}

// Format offset as UTC±HH:MM
function formatUtcOffset(tz) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
      hour: "2-digit", minute: "2-digit"
    });
    const parts = fmt.formatToParts(now);
    const tzName = parts.find(p => p.type === "timeZoneName")?.value || "";
    const m = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
    if (m) {
      const sign = m[1][0];
      const hours = m[1].slice(1).padStart(2, "0");
      const mins = (m[2] || "00").padStart(2, "0");
      return `UTC${sign}${hours}:${mins}`;
    }
  } catch {}
  return "UTC";
}

export function getPrettyZoneLabel(iana) {
  if (!iana) return "UTC";

  if (STATIC_LABELS[iana]) return STATIC_LABELS[iana];

  if (DST_SWAPPERS[iana]) {
    const { std, dst } = DST_SWAPPERS[iana];
    if (dst && std && dst !== std) {
      return isDstActive(iana) ? dst : std;
    }
    return std || dst;
  }

  // Try to pull a short non-GMT code first
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "short",
      hour: "2-digit"
    }).formatToParts(new Date());
    const val = parts.find(p => p.type === "timeZoneName")?.value || "";
    if (/^GMT/i.test(val)) {
      return formatUtcOffset(iana);
    }
    if (val.length <= 6) return val;
  } catch {
    // ignore
  }

  return formatUtcOffset(iana);
}
