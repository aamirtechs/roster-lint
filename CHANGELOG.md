# Changelog

## 1.0.0

- Initial release.
- Parse a roster CSV with person, date, start, end and role columns, including overnight shifts where the end time is on the next day.
- Configurable minimum rest hours and maximum weekly hours, plus per-day required coverage by role with optional per-date overrides.
- Checks for clopening shifts, overlapping shifts for the same person, weekly hours breaches and uncovered required slots.
- Weekend fairness table counting Saturday and Sunday shifts per person.
- Outputs report.md and findings.csv, with exit code 1 when any error-level finding exists.
