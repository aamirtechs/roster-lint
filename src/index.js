import fs from "node:fs";

export function parseCsv(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  const clean = rows.filter(r => !(r.length === 1 && r[0] === ""));
  if (clean.length === 0) return [];
  const headers = clean[0].map(h => h.trim());
  return clean.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

export function parseTimeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").trim());
  if (!m) throw new Error(`Invalid time "${t}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function shiftTimes(row) {
  const startMin = parseTimeToMinutes(row.start);
  let endMin = parseTimeToMinutes(row.end);
  const startMs = Date.parse(`${row.date}T00:00:00Z`) + startMin * 60000;
  let endMs = Date.parse(`${row.date}T00:00:00Z`) + endMin * 60000;
  if (endMin <= startMin) endMs += 86400000;
  return { startMs, endMs, hours: (endMs - startMs) / 3600000 };
}

export function rowsToShifts(rows) {
  return rows.map(r => {
    const { startMs, endMs, hours } = shiftTimes(r);
    return { person: r.person, date: r.date, start: r.start, end: r.end, role: r.role, startMs, endMs, hours };
  });
}

export function rosterFromCsvText(text) {
  return rowsToShifts(parseCsv(text));
}

export function loadRoster(file) {
  return rosterFromCsvText(fs.readFileSync(file, "utf8"));
}

export function defaultConfig() {
  return { minRestHours: 11, maxWeeklyHours: 40, coverage: [], coverageOverrides: {} };
}

export function normalizeConfig(raw) {
  const obj = raw || {};
  return { ...defaultConfig(), ...obj, coverage: obj.coverage || [], coverageOverrides: obj.coverageOverrides || obj.overrides || {} };
}

export function parseConfigText(text) {
  return normalizeConfig(JSON.parse(text));
}

export function loadConfig(file) {
  if (!file) return defaultConfig();
  return parseConfigText(fs.readFileSync(file, "utf8"));
}

export function lintCsvText(csvText, config) {
  const shifts = rosterFromCsvText(csvText);
  const cfg = config ? normalizeConfig(config) : defaultConfig();
  const result = lintRoster(shifts, cfg);
  return { shifts, config: cfg, result, findingsCsv: findingsToCsv(result.findings), report: buildReport(shifts, result, cfg) };
}

export function weekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(d.getTime() - diffToMonday * 86400000);
  return monday.toISOString().slice(0, 10);
}

export function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function lintRoster(shifts, config = defaultConfig()) {
  const cfg = { ...defaultConfig(), ...config };
  const findings = [];
  const sorted = [...shifts].sort((a, b) => a.startMs - b.startMs);

  const byPerson = new Map();
  for (const s of sorted) {
    if (!byPerson.has(s.person)) byPerson.set(s.person, []);
    byPerson.get(s.person).push(s);
  }

  for (const [person, list] of byPerson) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i];
      if (cur.startMs < prev.endMs) {
        findings.push({ type: "overlap", severity: "error", person, date: cur.date, role: cur.role, detail: `Overlaps shift on ${prev.date} ${prev.start}-${prev.end} (this shift ${cur.date} ${cur.start}-${cur.end})` });
      } else {
        const rest = (cur.startMs - prev.endMs) / 3600000;
        if (rest < cfg.minRestHours) {
          findings.push({ type: "clopen", severity: "error", person, date: cur.date, role: cur.role, detail: `Only ${rest.toFixed(1)} hours rest after shift ending ${prev.date} ${prev.end}, minimum is ${cfg.minRestHours} hours` });
        }
      }
    }
  }

  const weekly = new Map();
  for (const s of shifts) {
    const key = `${s.person}|${weekKey(s.date)}`;
    weekly.set(key, (weekly.get(key) || 0) + s.hours);
  }
  for (const [key, hours] of [...weekly.entries()].sort()) {
    const [person, week] = key.split("|");
    if (hours > cfg.maxWeeklyHours) {
      findings.push({ type: "weekly_hours", severity: "error", person, date: week, role: "", detail: `${hours.toFixed(1)} hours in week starting ${week}, maximum is ${cfg.maxWeeklyHours} hours` });
    }
  }

  const dates = [...new Set(shifts.map(s => s.date))].sort();
  for (const date of dates) {
    const overrides = cfg.coverageOverrides[date];
    const rules = overrides || cfg.coverage;
    for (const rule of rules) {
      const people = new Set(shifts.filter(s => s.date === date && s.role === rule.role).map(s => s.person));
      if (people.size < rule.minPeople) {
        findings.push({ type: "coverage", severity: "error", person: "", date, role: rule.role, detail: `Role ${rule.role} has ${people.size} people on ${date}, requires ${rule.minPeople}` });
      }
    }
    if (overrides) {
      const overriddenRoles = new Set(overrides.map(r => r.role));
      for (const rule of cfg.coverage) {
        if (overriddenRoles.has(rule.role)) continue;
        const people = new Set(shifts.filter(s => s.date === date && s.role === rule.role).map(s => s.person));
        if (people.size < rule.minPeople) {
          findings.push({ type: "coverage", severity: "error", person: "", date, role: rule.role, detail: `Role ${rule.role} has ${people.size} people on ${date}, requires ${rule.minPeople}` });
        }
      }
    }
  }

  const weekendCounts = new Map();
  for (const person of byPerson.keys()) weekendCounts.set(person, 0);
  for (const s of shifts) if (isWeekend(s.date)) weekendCounts.set(s.person, (weekendCounts.get(s.person) || 0) + 1);

  const totals = new Map();
  for (const s of shifts) totals.set(s.person, (totals.get(s.person) || 0) + s.hours);

  return { findings, weekendCounts, weekly, totals };
}

export function findingsToCsv(findings) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["type,severity,person,date,role,detail"];
  for (const f of findings) lines.push([f.type, f.severity, f.person, f.date, f.role, f.detail].map(esc).join(","));
  return lines.join("\n") + "\n";
}

export function buildReport(shifts, result, config = defaultConfig()) {
  const cfg = { ...defaultConfig(), ...config };
  const lines = [];
  lines.push("# Roster Lint Report", "");
  lines.push(`Shifts checked: ${shifts.length}`);
  lines.push(`People: ${result.weekendCounts.size}`);
  lines.push(`Minimum rest: ${cfg.minRestHours} hours`);
  lines.push(`Maximum weekly hours: ${cfg.maxWeeklyHours}`);
  lines.push(`Findings: ${result.findings.length}`, "");
  lines.push("## Findings", "");
  if (!result.findings.length) lines.push("No findings. The roster passes all checks.", "");
  else { for (const f of result.findings) lines.push(`- [${f.severity}] ${f.type}: ${f.person ? f.person + ", " : ""}${f.date}${f.role ? ", " + f.role : ""}. ${f.detail}`); lines.push(""); }
  lines.push("## Weekend fairness", "", "| Person | Weekend shifts | Total hours |", "| --- | --- | --- |");
  for (const [person, count] of [...result.weekendCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${person} | ${count} | ${(result.totals.get(person) || 0).toFixed(1)} |`);
  }
  lines.push("", "## Weekly hours", "", "| Person | Week starting | Hours |", "| --- | --- | --- |");
  for (const [key, hours] of [...result.weekly.entries()].sort()) {
    const [person, week] = key.split("|");
    lines.push(`| ${person} | ${week} | ${hours.toFixed(1)} |`);
  }
  lines.push("");
  return lines.join("\n");
}
