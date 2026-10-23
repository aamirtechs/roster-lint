# roster-lint
Live page: https://aamirtechs.github.io/roster-lint/
Use it in your browser: the Pages site above runs the full tool locally, no install needed.

Lint a shift roster CSV before you publish it: clopening shifts, overtime breaches, double bookings, uncovered required slots and unfair weekend distribution, in one clear report for ops and support team leads.

## Why

Most roster problems are obvious the day after you publish, when someone is working a close followed by an open, is double booked, or a required slot sits empty. This tool checks the CSV before it goes out, so a team lead can fix the file instead of apologising for it.

## Install

Requires Node.js 20 or later. There are no dependencies.

```bash
git clone https://github.com/aamirtechs/roster-lint.git
cd roster-lint
node src/cli.js --help
```

## Input

A roster CSV with columns:

```csv
person,date,start,end,role
Ayesha,2026-01-05,09:00,17:00,support
Bilal,2026-01-05,22:00,06:00,support
```

Times are `HH:MM`. If `end` is before `start`, the shift is overnight and the end counts as the next day.

An optional config JSON file:

```json
{
  "minRestHours": 11,
  "maxWeeklyHours": 40,
  "coverage": [
    { "role": "support", "minPeople": 2 },
    { "role": "lead", "minPeople": 1 }
  ],
  "coverageOverrides": {
    "2026-01-10": [
      { "role": "support", "minPeople": 1 },
      { "role": "lead", "minPeople": 1 }
    ]
  }
}
```

`minRestHours` defaults to 11 and `maxWeeklyHours` defaults to 40. The `coverage` array applies per day to every date present in the roster. `coverageOverrides` replaces the rule for that role on that date, as shown for the Saturday in `examples/config.json`.

## Usage

```bash
roster-lint <roster.csv> [--config config.json] [--out-dir .]
```

Outputs `report.md` and `findings.csv` in the output directory. The exit code is 1 when any error-level finding exists, and 0 when the roster is clean, so it can gate a publish step in a script.

Checks performed:

- Clopens: rest between consecutive shifts for the same person under `minRestHours`.
- Overlaps: two shifts for the same person that overlap in time, including overnight shifts.
- Weekly hours: total hours per person per week (weeks start on Monday) over `maxWeeklyHours`.
- Coverage: any date where a role has fewer distinct people than its required coverage rule.
- Weekend fairness: a table of Saturday and Sunday shift counts per person in the report, so distribution is visible even when it is not an error.

## Example

`examples/roster.csv` is a synthetic one-week roster with a clopen, a double booking, three weekly-hours breaches and an uncovered Sunday. `examples/config.json` requires 2 support and 1 lead per day, relaxed to 1 support on Saturday 2026-01-10.

Run it:

```bash
node src/cli.js examples/roster.csv --config examples/config.json --out-dir /tmp/roster-out
```

Real output captured from that run (note the exit code):

```text
Checked 20 shifts for 4 people
Findings: 7
clopen: 1
overlap: 1
weekly_hours: 3
coverage: 2
Wrote /tmp/roster-out/findings.csv and /tmp/roster-out/report.md
```

Exit code for that run: 1.

The generated `report.md` includes:

```markdown
# Roster Lint Report

Shifts checked: 20
People: 4
Minimum rest: 11 hours
Maximum weekly hours: 40
Findings: 7

## Findings

- [error] clopen: Ayesha, 2026-01-05, support. Only 5.0 hours rest after shift ending 2026-01-05 17:00, minimum is 11 hours
- [error] overlap: Bilal, 2026-01-06, support. Overlaps shift on 2026-01-06 06:00-14:00 (this shift 2026-01-06 10:00-18:00)
- [error] weekly_hours: Ayesha, 2026-01-05. 56.0 hours in week starting 2026-01-05, maximum is 40 hours
- [error] coverage: 2026-01-11, support. Role support has 1 people on 2026-01-11, requires 2
- [error] coverage: 2026-01-11, lead. Role lead has 0 people on 2026-01-11, requires 1

## Weekend fairness

| Person | Weekend shifts | Total hours |
| --- | --- | --- |
| Ayesha | 2 | 56.0 |
| Chen | 1 | 48.0 |
| Bilal | 0 | 48.0 |
| Dana | 0 | 8.0 |
```

A clean roster is included too. This run exits with code 0:

```bash
node src/cli.js examples/roster-clean.csv --config examples/config.json --out-dir /tmp/roster-clean
```

```text
Checked 6 shifts for 3 people
Findings: 0
Wrote /tmp/roster-clean/findings.csv and /tmp/roster-clean/report.md
```

## Library use

```js
import { loadRoster, loadConfig, lintRoster } from "./src/index.js";

const shifts = loadRoster("examples/roster.csv");
const result = lintRoster(shifts, loadConfig("examples/config.json"));
console.log(result.findings);
```

## Tests

```bash
npm test
```

## License

MIT. Copyright (c) 2026 Amir Hussain.
