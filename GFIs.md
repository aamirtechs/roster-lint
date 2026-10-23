# Good First Issues

## 1. Google Sheets export template plus example

Add a Google Sheets template that exports exactly the CSV columns this tool expects, together with a filled example sheet export in the examples folder. The template should include the person, date, start, end and role headers and a short note on the HH:MM time format. Document how to download the sheet as CSV and run the linter on it.

## 2. Public-holiday CSV input that relaxes coverage rules

Add an optional holidays CSV input listing dates that count as public holidays. On those dates, required coverage rules should be relaxed or skipped according to a clear documented rule, for example using the per-date override if one exists and otherwise skipping coverage checks. Include tests showing a normal date still fails coverage while a listed holiday does not.

## 3. Per-person undesirable-shift fairness score

Add a fairness score per person that weights night, overnight and weekend shifts more heavily than weekday day shifts, and show it beside the existing weekend counts in the report. The weighting should live in one documented place so teams can adjust it. Cover the calculation with tests for a day shift, a night shift and a weekend shift.
