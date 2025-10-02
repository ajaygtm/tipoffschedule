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