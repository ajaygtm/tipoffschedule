# TipOffSchedule – MVP Product & Technical Specification (Frozen Snapshot)

Purpose: A super-fast, minimal, calm web app for viewing NBA regular season schedules: today’s games + per-team month calendar + downloadable ICS files (full season, remainder, all teams). Designed for extensibility to other leagues later.

Status: FROZEN MVP SPEC (no live scores, no preseason, no backend).

## Brand & Design Principles
- Name: TipOffSchedule
- Tone: Quiet, clean, utilitarian
- Palette: Light off-white (#f7f8fa), subtle borders (#e2e5e9), teal accent (#19a2b3), dark mode background (#1e1f22)
- Team colors: Functional accents only (ribbons, small markers)
- Logos: 64px transparent PNGs (with optional 128px variants)

## Core Views

### Date View (default)
- Horizontal scroll date bar (Today centered)
- Game cards list for selected date
- Card: AWAY @ HOME with logos + 24h local time + timezone label (e.g., IST)
- Abbreviations only (tri-codes); full names hidden (aria)
- All Teams Full Season .ics export button

### Team View
- Team selector (grid / dropdown)
- Monday-start monthly calendar
- Each day: at most one regular season game per team
- Ribbon/pill in cell: vs XYZ or @ XYZ (team colors)
- ICS buttons: Team Full Season, Team Remainder, All Teams Full Season

## ICS Exports
- Team Full Season
- Team Remainder (games >= user’s local “today”)
- All Teams Full Season
- Client-side only
- UID: {game_id}@tipoffschedule
- DTSTAMP: generation UTC
- DTSTART: game start UTC
- DTEND: +2h30m
- SUMMARY: LAL @ BOS or LAL vs BOS (if listing/home logic)
- DESCRIPTION: "Unofficial NBA regular season schedule. Source: public data."
- Line endings: \r\n
- No alarms/categories (MVP)

## Time & Timezones
- Stored in JSON: UTC ISO (date_utc)
- Display: User local timezone only
- Remainder filter: local midnight → UTC

## Included in MVP
- Regular season only
- Dark mode via prefers-color-scheme
- Team colors (ribbons/accents)
- Lazy logos
- Accessibility basics
- 24h time format

## Excluded (MVP)
Preseason, playoffs, live scores, rosters, stats, service worker/offline, user favorites, arena timezones, notifications, auth, pre-generated ICS hosting.

## Data Model (Sample)
schedule/nba_2024_25_regular.json
{
  "league": "NBA",
  "season": "2024-25",
  "generated_utc": "2025-07-15T10:00:00Z",
  "games": [
    {
      "game_id": "0022400001",
      "date_utc": "2024-10-22T23:30:00Z",
      "home_team_id": 1610612747,
      "home_tri": "LAL",
      "away_team_id": 1610612738,
      "away_tri": "BOS"
    }
  ],
  "meta": { "preseason_included": false }
}

## Performance Tactics
- Single JSON fetch
- Vanilla ES modules
- Defer scripts
- Lazy load images
- Potential future per-team slicing

## Success Criteria
- <1s cold load on broadband
- Accurate today’s games
- Team calendar functional
- ICS imports in Google + Apple
- Dark mode automatic
- No console errors

## Backlog (Future)
WNBA, arena timezone toggle, preseason toggle, favorites, offline snapshot, pre-generated ICS, roster overlays, service worker caching.

## Legal
Footer: "Unofficial schedule viewer. Not affiliated with or endorsed by the NBA."

## Initial Task Breakdown (Abbrev)
T1 README
T2 CONTEXT spec
T3 Mock schedule JSON
T4 Teams JSON
T5 Logos
T6 Basic index.html
T7 Base CSS
T8 Visually hidden utility
... (full list maintained separately)

## Edge Cases
- Local timezone ahead of UTC (date boundary)
- Days with zero games
- Team with no remaining games
- Broken/missing logos
- Month boundary (first/last day)
- Large ICS (All Teams) still acceptable
- Remainder filter correctness

This document represents the frozen MVP scope at initialization (can version if spec evolves).