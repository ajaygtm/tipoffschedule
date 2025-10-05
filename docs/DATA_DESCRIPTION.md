# NBA scheduleLeagueV2.json – Data Description & Field Usage Guide

This document focuses solely on the public NBA schedule JSON obtained from:
`https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json`

It explains the structure, field semantics, data quality considerations, transformation guidance for a normalized schedule file, and recommendations on which fields to retain or ignore for a typical schedule-centric application (e.g., generating calendar exports). No application UI or non‑data features are covered here.

---

## 1. Source Overview

| Aspect | Details |
|--------|---------|
| Endpoint | `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` |
| Access | Public, no authentication required |
| Content Scope | Preseason, Regular Season, (later) In‑Season Tournament flags, Playoffs (once scheduled) |
| Format | Single JSON object with nested arrays grouped by calendar date |
| Stability | Structure has been consistent across recent seasons; minor optional field additions possible |
| Update Frequency | Updated when schedule adjustments occur (time shifts, added labels, broadcasts) |
| Encoding | UTF‑8 JSON |
| Size Consideration | Usually < 2–3 MB uncompressed (varies by added metadata) |
| Rate Concerns | Light usage (single fetch / day) is typically fine |
| Legal Note | Publicly accessible; not an official redistribution license (treat as reference data) |

---

## 2. High-Level Hierarchy

```
root
└── leagueSchedule (object)
      └── gameDates (array)
            ├── { gameDate: "YYYY-MM-DD", games: [ gameObj, ... ] }
            ├── ...
```

You iterate `leagueSchedule.gameDates[]`, then each `games[]` item is an individual scheduled (or completed) game.

---

## 3. Game Identification & Season Logic

| Component | Meaning |
|-----------|---------|
| `gameId` | Primary unique string. |
| Pattern | `PPPSSNNNNN` (length 10). |
| PPP (prefix) | 001 = Preseason, 002 = Regular, 003 = Special (e.g., All‑Star), 004 = Playoffs (includes Play‑In in recent years), other codes rare. |
| SS | Last two digits of the starting year of the season (e.g., 25 for 2025–26). |
| NNNNN | Incremental counter (zero‑padded). Regular season indices run 00001–01230 (1230 games total). |
| Filtering Regular Season | Include only `gameId.startswith("00225")` for 2025–26. |
| Expected Count | Regular season: 1230 unique games. Each of 30 teams appears 82 times (home+away). |

---

## 4. Core Data Objects

### 4.1 Date Group Object

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `gameDate` | string (YYYY-MM-DD) | Always | Calendar date (no time) grouping the games |
| `games` | array<object> | Always | Array of game objects for that date |

### 4.2 Game Object (Raw) – Consolidated Field Table

Legend for Recommended Use:
- KEEP: strongly recommended to retain
- CONSIDER: optional; depends on extended needs
- IGNORE: not needed for base schedule / calendar export

| Field | Type | Typical Presence | Recommended Use | Description / Semantics | Example |
|-------|------|------------------|-----------------|-------------------------|---------|
| `gameId` | string | Always | KEEP | Unique game identifier (phase + season + sequence) | "0022500001" |
| `gameCode` | string | Usually | IGNORE | Composite code often date + teams; derivable | "20251021/LALBOS" |
| `seasonStageId` | integer | Always | KEEP (for filtering) | 1=Preseason, 2=Regular, 4=Playoffs, others possible | 2 |
| `seasonYear` | integer | Usually | CONSIDER | Starting year of season | 2025 |
| `leagueName` | string | Usually | IGNORE | Most often "standard" | "standard" |
| `gameStatus` | integer | Always | IGNORE (MVP) | 1=Scheduled, 2=Live, 3=Final | 1 |
| `gameStatusText` | string | Usually | IGNORE | Human display status | "" |
| `gameSequence` | integer | Usually | IGNORE | Ordering index for the date | 1 |
| `gameDateEst` | string (ISO-ish) | Usually | IGNORE | Date/time in Eastern time zone | "2025-10-21T19:30:00-04:00" |
| `gameTimeEst` | string | Usually | IGNORE | Human ET time | "7:30 PM ET" |
| `gameDateTimeEst` | string | Sometimes | IGNORE | Duplicate semantics of `gameDateEst` | "2025-10-21T19:30:00-04:00" |
| `gameDateUTC` | string (YYYY-MM-DD) | Usually | IGNORE | Date portion in UTC; redundant if using `startTimeUTC` | "2025-10-21" |
| `gameTimeUTC` | string (HH:MM) | Usually | IGNORE | Time portion in UTC | "23:30" |
| `startTimeUTC` | string (ISO 8601 UTC) | Always | KEEP | Canonical full UTC timestamp for scheduling | "2025-10-21T23:30:00Z" |
| `isBuzzerBeater` | boolean | Sometimes | IGNORE | Post-game flag for dramatic finish | false |
| `isInProgress` | boolean | Sometimes | IGNORE | Live flag | false |
| `period` | integer | Sometimes | IGNORE | Current period if live (0 pre-tip) | 0 |
| `vTeam` | object | Always | KEEP | Visiting team object (see team table) | {...} |
| `hTeam` | object | Always | KEEP | Home team object | {...} |
| `arenaName` | string | Usually | CONSIDER | Venue name | "Crypto.com Arena" |
| `arenaCity` | string | Usually | CONSIDER | Venue city | "Los Angeles" |
| `arenaState` | string | Sometimes | IGNORE | State/region code | "CA" |
| `arenaCountry` | string | Sometimes | IGNORE | Country | "USA" |
| `broadcasters` | object | Sometimes | IGNORE | Lists networks by category | {...} |
| `watch` | object | Sometimes | IGNORE | Streaming info container | {...} |
| `whStatus` | integer | Rare | IGNORE | Placeholder / rarely documented | 1 |
| `seriesGameNumber` | string | Playoffs | IGNORE (regular season) | Game number in playoff series | "2" |
| `seriesText` | string | Playoffs | IGNORE | Human series status | "Series tied 1-1" |
| `ifNecessary` | boolean | Playoffs | IGNORE | Contingent playoff games | false |
| `playoffRound` | integer | Playoffs | IGNORE | Round index | 1 |
| `ticket` | object | Sometimes | IGNORE | Ticket info metadata | {...} |
| `labels` | array | Sometimes | IGNORE (unless you want tournament tagging) | UI labels (e.g., tournament) | [ {...} ] |
| `flexScheduleIndicator` | string | Sometimes | IGNORE | Flex scheduling marker | "" |
| `inSeasonTournament` | boolean | Sometimes | CONSIDER (if marking IST) | Flags IST game | true |
| `gameSubtype` | string | Sometimes | CONSIDER (if distinguishing IST) | e.g., "IST" | "IST" |
| `intlFlag` | string | Sometimes | IGNORE | International event flag | "" |

### 4.3 Team Subobject (vTeam & hTeam)

| Field | Type | Presence | Recommended Use | Description | Example |
|-------|------|----------|-----------------|-------------|---------|
| `teamId` | string | Always | KEEP | Numeric as string; can convert to int | "1610612747" |
| `triCode` | string | Always | KEEP | Three-letter abbreviation | "LAL" |
| `win` | string | Always (updates in-season) | IGNORE | Current wins; dynamic | "0" |
| `loss` | string | Always | IGNORE | Current losses | "0" |
| `seriesWin` | string | Playoffs | IGNORE | Series wins | "0" |
| `seriesLoss` | string | Playoffs | IGNORE | Series losses | "0" |
| `score` | string | Always (empty pre-game) | IGNORE | Score if live/final else "" | "" |
| `seed` | integer/null | Playoffs | IGNORE | Seed number | 2 |
| `isNBAFranchise` | boolean | Always | IGNORE | Franchise flag | true |
| `isAllStar` | boolean | Always | IGNORE | All-Star marker | false |

---

## 5. Recommended Minimal Normalized Schema

Focus only on stable schedule essentials:

```json
{
  "league": "NBA",
  "season": "2025-26",
  "generated_utc": "2025-10-05T12:00:00Z",
  "games": [
    {
      "game_id": "0022500001",
      "date_utc": "2025-10-21T23:30:00Z",
      "home_team_id": 1610612747,
      "home_tri": "LAL",
      "away_team_id": 1610612738,
      "away_tri": "BOS",
      "venue": "Crypto.com Arena",
      "venue_city": "Los Angeles"
    }
  ],
  "meta": {
    "preseason_included": false
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `league` | string | Static "NBA" |
| `season` | string | Human label (“2025-26”) |
| `generated_utc` | string (ISO 8601 UTC) | Set at build time |
| `games` | array | Flattened regular season only |
| `games[].game_id` | string | From `gameId` |
| `games[].date_utc` | string | From `startTimeUTC` |
| `games[].home_team_id` | integer | Convert `hTeam.teamId` |
| `games[].home_tri` | string | From `hTeam.triCode` |
| `games[].away_team_id` | integer | Convert `vTeam.teamId` |
| `games[].away_tri` | string | From `vTeam.triCode` |
| `games[].venue` | string/null | From `arenaName` |
| `games[].venue_city` | string/null | From `arenaCity` |
| `meta.preseason_included` | boolean | Always false for regular-only file |

---

## 6. Field Decision Matrix (Why Keep / Drop)

| Purpose | Required Fields | Justification |
|---------|-----------------|---------------|
| Unique identification | game_id | ICS UID, dedupe, linking |
| Scheduling (time) | date_utc | Canonical full UTC timestamp |
| Home/Away logic | home_* + away_* | Display, ICS summary rules |
| Venue (optional) | venue, venue_city | Optional display context |
| Filtering | (prefix in game_id) or seasonStageId | Keep prefix rule; no need to store explicitly |
| Status / Scores | (none) | Not needed for static schedule exports |

Dropped fields add noise or require refreshes (scores, standings).

---

## 7. Time Field Comparison

| Field | Content | Pros | Cons | Recommendation |
|-------|---------|------|------|----------------|
| `startTimeUTC` | Full UTC ISO timestamp | Single authoritative value | None (unless missing—rare) | KEEP |
| `gameDateEst` | ET datetime with offset | Contains ET zone offset | Redundant if using UTC | IGNORE |
| `gameTimeEst` | ET time string | Human shaped | Formatting overhead | IGNORE |
| `gameDateUTC` + `gameTimeUTC` | Split date/time UTC | Simple splits | Redundant; need join | IGNORE |

Edge Case: If `startTimeUTC` missing (very unusual), fallback could be constructed from `gameDateUTC + gameTimeUTC` (append ":00Z"). Not typically necessary.

---

## 8. Integrity & Validation Checks

| Check | Method | Expected |
|-------|--------|----------|
| Game count | Count games where `gameId` starts with `00225` | 1230 |
| Uniqueness | Set length of all `game_id`s | = 1230 |
| Per Team Appearances | For each teamId: count of home + away | 82 |
| Timestamp validity | Parse each `date_utc` | All valid |
| Chronological sanity | Min/Max `date_utc` | Late Oct → mid-April |
| Duplicates (Teams per game) | Ensure (away, home, date_utc) unique | All unique |
| Optional fields | `venue` may be null or missing | Acceptable |

---

## 9. Game ID Phase Codes (Summary)

| Prefix | Phase | Include in Regular File? |
|--------|-------|---------------------------|
| 001SS | Preseason | No |
| 002SS | Regular Season | Yes |
| 003SS | Special / All-Star (varies) | No |
| 004SS | Playoffs / Play-In | No (MVP regular only) |

SS = starting year last two digits (e.g., 25 for 2025–26).

---

## 10. Example Raw Game Snippet (Simplified)

```json
{
  "gameId": "0022500001",
  "gameCode": "20251021/LALBOS",
  "seasonStageId": 2,
  "seasonYear": 2025,
  "gameStatus": 1,
  "gameStatusText": "",
  "gameDateEst": "2025-10-21T19:30:00-04:00",
  "gameTimeEst": "7:30 PM ET",
  "gameDateUTC": "2025-10-21",
  "gameTimeUTC": "23:30",
  "startTimeUTC": "2025-10-21T23:30:00Z",
  "vTeam": {
    "teamId": "1610612738",
    "triCode": "BOS",
    "win": "0",
    "loss": "0",
    "score": "",
    "isNBAFranchise": true,
    "isAllStar": false
  },
  "hTeam": {
    "teamId": "1610612747",
    "triCode": "LAL",
    "win": "0",
    "loss": "0",
    "score": "",
    "isNBAFranchise": true,
    "isAllStar": false
  },
  "arenaName": "Crypto.com Arena",
  "arenaCity": "Los Angeles",
  "arenaState": "CA",
  "arenaCountry": "USA"
}
```

---

## 11. Example Transformation (Raw → Normalized)

| Raw Field | Normalized Field | Transform |
|-----------|------------------|----------|
| `gameId` | `game_id` | Copy |
| `startTimeUTC` | `date_utc` | Copy |
| `hTeam.teamId` | `home_team_id` | Parse int |
| `hTeam.triCode` | `home_tri` | Copy |
| `vTeam.teamId` | `away_team_id` | Parse int |
| `vTeam.triCode` | `away_tri` | Copy |
| `arenaName` | `venue` | Copy / null if missing |
| `arenaCity` | `venue_city` | Copy / null if missing |

Discard all other fields for minimal schedule representation.

---

## 12. Handling Optional / Missing Data

| Scenario | Occurrence | Strategy |
|----------|------------|----------|
| Missing `arenaName` / `arenaCity` | Occasional for special/neutral/site games early | Store as null; do not block inclusion |
| Empty `score` pre-game | Normal | Ignore entirely |
| Unexpected missing `startTimeUTC` | Extremely rare | Fallback to join `gameDateUTC` + `gameTimeUTC` if both present |
| Additional new keys appear | Possible in future | Ignore unless needed |
| Duplicate `gameId` (anomaly) | Very rare | Flag & review; should not proceed silently |

---

## 13. Optional Extension Fields (If planning tournament tags)

| Raw Field | Purpose | Notes |
|-----------|---------|-------|
| `inSeasonTournament` | Flag IST game | Boolean |
| `gameSubtype` | Tag like "IST" | Use with caution; may vary |
| `labels[]` | Text labels | Contains localized descriptors |

If you want to add a simple IST marker later, retain `inSeasonTournament` or `gameSubtype` in your normalized model as a boolean/string.

---

## 14. JSON Schema Draft (Normalized File)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "NBA Regular Season Schedule (Normalized)",
  "type": "object",
  "required": ["league", "season", "generated_utc", "games", "meta"],
  "properties": {
    "league": { "type": "string", "const": "NBA" },
    "season": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}$" },
    "generated_utc": { "type": "string", "format": "date-time" },
    "meta": {
      "type": "object",
      "required": ["preseason_included"],
      "properties": {
        "preseason_included": { "type": "boolean" }
      },
      "additionalProperties": false
    },
    "games": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "game_id",
          "date_utc",
          "home_team_id",
          "home_tri",
          "away_team_id",
          "away_tri"
        ],
        "properties": {
          "game_id": { "type": "string", "pattern": "^[0-9]{10}$" },
          "date_utc": { "type": "string", "format": "date-time" },
          "home_team_id": { "type": "integer" },
            "home_tri": { "type": "string", "minLength": 2, "maxLength": 4 },
          "away_team_id": { "type": "integer" },
          "away_tri": { "type": "string", "minLength": 2, "maxLength": 4 },
          "venue": { "type": ["string", "null"] },
          "venue_city": { "type": ["string", "null"] }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

---

## 15. Change Detection (If Monitoring Updates)

| Element | Approach |
|---------|----------|
| Time changes | Hash tuple `(game_id, date_utc)` across builds; diff for shifts |
| Added games | Unexpected in regular season; investigate if count > 1230 |
| Removed games | Should not occur; treat as potential cancellation/reschedule pending updated entry |
| Strategy | Nightly fetch → Diff → Log differences -> Regenerate dependent artifacts (e.g., ICS) if changes |

---

## 16. Data Quality Pitfalls & Mitigations

| Pitfall | Impact | Mitigation |
|---------|--------|-----------|
| Assuming all fields exist | Runtime errors | Use safe access with defaults |
| Treating numeric IDs as numbers in early pipeline | None severe | Convert only at normalization stage |
| Using ET-derived fields for scheduling | Possible timezone shift errors | Rely only on `startTimeUTC` |
| Expecting venue always present | Null dereference | Allow null; optional display |
| Counting raw games for totals without filtering | Inflated count (includes preseason) | Filter by `gameId` prefix |
| Using score fields in static schedule | Stale/confusing | Exclude from normalized dataset |

---

## 17. Minimal Extraction Pseudocode (Language-Agnostic)

```
for dateGroup in root.leagueSchedule.gameDates:
  for game in dateGroup.games:
    if game.gameId starts with "00225":
      emit {
        game_id: game.gameId,
        date_utc: game.startTimeUTC,
        home_team_id: int(game.hTeam.teamId),
        home_tri: game.hTeam.triCode,
        away_team_id: int(game.vTeam.teamId),
        away_tri: game.vTeam.triCode,
        venue: game.arenaName or null,
        venue_city: game.arenaCity or null
      }
```

After loop:
- Validate count = 1230
- Validate all teams appear 82 times

---

## 18. Decision Summary (Adopt vs Exclude)

| Category | Adopt | Exclude |
|----------|-------|---------|
| Identification | `gameId` | `gameCode` |
| Time | `startTimeUTC` | All other time variants |
| Teams | `teamId`, `triCode` | Win/loss, score, seed |
| Venue | Name, City (optional) | State, Country |
| Phase filtering | Use `gameId` prefix | `seasonStageId` (optional secondary check) |
| Tournament flags | (Future) `inSeasonTournament` | `labels`, `gameSubtype` (unless needed) |
| Broadcast/Watch | (None) | `broadcasters`, `watch` |

---

## 19. Quick Verification Snippets

### List Distinct Game Keys (Python)
```python
import json
data = json.load(open("raw_scheduleLeagueV2.json"))
keys = set()
tkeys = set()
for d in data["leagueSchedule"]["gameDates"]:
    for g in d["games"]:
        keys |= g.keys()
        if "hTeam" in g: tkeys |= g["hTeam"].keys()
print("Game keys:", sorted(keys))
print("Team keys:", sorted(tkeys))
```

### Validation (Python)
```python
import json, collections
norm = json.load(open("nba_2025_26_regular.json"))
games = norm["games"]
assert len(games) == 1230, "Unexpected game count"
ids = [g["game_id"] for g in games]
assert len(ids) == len(set(ids)), "Duplicate game_id"
by_team = collections.Counter()
for g in games:
    by_team[g["home_team_id"]] += 1
    by_team[g["away_team_id"]] += 1
assert all(v == 82 for v in by_team.values()), "Team game count mismatch"
```

---

## 20. FAQ (Data-Centric)

| Question | Answer |
|----------|--------|
| Why ignore score? | Static schedule; score adds volatility & refresh burden. |
| Should I store ET field for display? | No; convert UTC to user local dynamically. |
| How to detect regular season reliably? | `gameId.startswith("00225")` for 2025–26. |
| Any timezone conversions needed pre-storage? | No; `startTimeUTC` already UTC canonical. |
| Do I need per-arena timezone? | Not for pure UTC storage + local display; can map later if feature needed. |

---

## 21. Final Minimal Field Set (Checklist)

| Field | Included | Reason |
|-------|----------|--------|
| game_id | Yes | Unique reference / ICS UID |
| date_utc | Yes | Canonical time basis |
| home_team_id | Yes | Team mapping / logic |
| home_tri | Yes | Display abbreviation |
| away_team_id | Yes | Team mapping / logic |
| away_tri | Yes | Display abbreviation |
| venue | Optional | Context |
| venue_city | Optional | Context |

Everything else excluded intentionally for clarity and performance.

---

## 22. Extension Hooks (If Needed Later)

| Future Need | Add Field(s) | Source |
|-------------|--------------|--------|
| In-Season Tournament marker | `inSeasonTournament` (boolean) | Raw game object |
| Tournament labeling | `gameSubtype` | Raw game object |
| International games flag | `intlFlag` | Raw game object |
| Broadcast info display | `broadcasters` | Raw game object |
| Playoffs support | `seasonStageId`, `seriesGameNumber` | Raw game object |

---

## 23. Versioning Strategy (Optional)

| Strategy | Description |
|----------|-------------|
| Timestamp hashing | Store SHA256 over sorted `(game_id,date_utc)` pairs |
| Change log entry | Append differences with `old_time` / `new_time` |
| Regeneration trigger | If hash changes, rebuild ICS exports |

---

## 24. Conclusion

The scheduleLeagueV2.json source provides a rich superset of data; for a stable, fast schedule application, a narrow normalized schema focusing on immutable identification and UTC start times is sufficient. Additional metadata (venues, tournaments, broadcasts) can be layered later without restructuring core fields.

End of data description.
