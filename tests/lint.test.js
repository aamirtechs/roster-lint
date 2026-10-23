import { test } from "node:test";
import assert from "node:assert/strict";
import { lintRoster, parseCsv, shiftTimes, weekKey, isWeekend, loadConfig, defaultConfig } from "../src/index.js";

function shift(person, date, start, end, role = "support") {
  const r = { person, date, start, end, role };
  const { startMs, endMs, hours } = shiftTimes(r);
  return { ...r, startMs, endMs, hours };
}

test("parseCsv parses roster rows", () => {
  const rows = parseCsv("person,date,start,end,role\nAyesha,2026-01-05,09:00,17:00,support\n");
  assert.equal(rows[0].person, "Ayesha");
});

test("overnight shift counts end as next day", () => {
  const s = shift("A", "2026-01-05", "22:00", "06:00");
  assert.equal(s.hours, 8);
});

test("weekKey returns Monday of the week", () => {
  assert.equal(weekKey("2026-01-08"), "2026-01-05");
  assert.equal(weekKey("2026-01-11"), "2026-01-05");
  assert.equal(weekKey("2026-01-12"), "2026-01-12");
});

test("isWeekend detects Saturday and Sunday", () => {
  assert.equal(isWeekend("2026-01-10"), true);
  assert.equal(isWeekend("2026-01-11"), true);
  assert.equal(isWeekend("2026-01-05"), false);
});

test("clopen detected when rest is under minimum", () => {
  const shifts = [shift("A", "2026-01-05", "09:00", "17:00"), shift("A", "2026-01-05", "22:00", "06:00")];
  const r = lintRoster(shifts, { minRestHours: 11, maxWeeklyHours: 40, coverage: [] });
  assert.equal(r.findings.filter(f => f.type === "clopen").length, 1);
});

test("enough rest passes clopen check", () => {
  const shifts = [shift("A", "2026-01-05", "09:00", "17:00"), shift("A", "2026-01-06", "09:00", "17:00")];
  const r = lintRoster(shifts, defaultConfig());
  assert.equal(r.findings.filter(f => f.type === "clopen").length, 0);
});

test("overlap detected for same person", () => {
  const shifts = [shift("A", "2026-01-05", "06:00", "14:00"), shift("A", "2026-01-05", "10:00", "18:00")];
  const r = lintRoster(shifts, defaultConfig());
  assert.equal(r.findings.filter(f => f.type === "overlap").length, 1);
});

test("weekly hours breach detected", () => {
  const shifts = [];
  for (const d of ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"]) shifts.push(shift("A", d, "09:00", "17:00"));
  const r = lintRoster(shifts, { minRestHours: 11, maxWeeklyHours: 40, coverage: [] });
  assert.equal(r.findings.filter(f => f.type === "weekly_hours").length, 1);
});

test("coverage shortfall detected and override relaxes it", () => {
  const shifts = [shift("A", "2026-01-05", "09:00", "17:00", "support"), shift("B", "2026-01-05", "09:00", "17:00", "lead")];
  const cfg = { minRestHours: 11, maxWeeklyHours: 40, coverage: [{ role: "support", minPeople: 2 }] };
  const r = lintRoster(shifts, cfg);
  assert.equal(r.findings.filter(f => f.type === "coverage").length, 1);
  const cfg2 = { ...cfg, coverageOverrides: { "2026-01-05": [{ role: "support", minPeople: 1 }] } };
  const r2 = lintRoster(shifts, cfg2);
  assert.equal(r2.findings.filter(f => f.type === "coverage").length, 0);
});

test("weekend counts are tallied per person", () => {
  const shifts = [shift("A", "2026-01-10", "09:00", "17:00"), shift("A", "2026-01-11", "09:00", "17:00"), shift("B", "2026-01-05", "09:00", "17:00")];
  const r = lintRoster(shifts, defaultConfig());
  assert.equal(r.weekendCounts.get("A"), 2);
  assert.equal(r.weekendCounts.get("B"), 0);
});

test("default config values", () => {
  const c = defaultConfig();
  assert.equal(c.minRestHours, 11);
  assert.equal(c.maxWeeklyHours, 40);
});
