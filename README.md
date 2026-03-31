# TipOffSchedule

Minimal, fast NBA regular season schedule viewer.
Focus Areas: 
- Date View: today + horizontal scroll date picker
- Team View: Monday-start monthly calendar with color ribbons
- ICS exports: Full Season (team/all), Remainder (team)

Status: MVP in progress (frozen spec snapshot in docs/CONTEXT.md)

## Core Principles
- Vanilla ES modules (no framework)
- Single JSON fetch for schedule + teams
- Accessible (aria-labels, hidden full names)
- Lightweight styling, automatic dark mode
- Fast first paint (<1s target on broadband)

## Disclaimer
Unofficial schedule viewer. Not affiliated with or endorsed by the NBA.

## License
MIT (see LICENSE)

## Roadmap (High Level)
1. Scaffolding (this commit)
2. Add mock schedule + teams JSON
3. Date View rendering
4. Team View calendar
5. ICS generation
6. Polish + performance pass

See docs/CONTEXT.md for full MVP spec.

## Data Update Pipeline

Use these scripts to keep the schedule file updated throughout the season:

- `npm run update-schedule` - syncs games from NBA schedule API into the configured season JSON
- `npm run update-scores` - updates game status and scores from ESPN scoreboard API
- `npm run update-standings` - refreshes `data/standings.json` from ESPN standings API
- `npm run update-data` - runs all three scripts in sequence

### Run Schedule

All scripts are automatic via GitHub Actions. Manual runs are optional.

| Task | Command | Auto | Frequency |
|---|---|---|---|
| Sync schedule | `npm run update-schedule` | ✓ | 5 AM, 12 PM, 8 PM UTC |
| Update scores | `npm run update-scores` | ✓ | 5 AM, 12 PM, 8 PM UTC |
| Update standings | `npm run update-standings` | ✓ | 5 AM, 12 PM, 8 PM UTC |
| Run all 3 | `npm run update-data` | Manual only | On demand |

### Dry Run (Test Mode)

Test without writing files:

- `npm run update-schedule -- --dry-run`
- `npm run update-scores -- --dry-run`
- `npm run update-standings -- --dry-run`
- `npm run update-data -- --dry-run`