#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadRoster, loadConfig, lintRoster, findingsToCsv, buildReport } from "./index.js";

function parseArgs(argv) {
  const args = { config: null, outDir: "." };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") args.config = argv[++i];
    else if (argv[i] === "--out-dir") args.outDir = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else pos.push(argv[i]);
  }
  args.input = pos[0];
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.input) {
  console.log("Usage: roster-lint <roster.csv> [--config config.json] [--out-dir .]");
  process.exit(args.help ? 0 : 1);
}
const config = loadConfig(args.config);
const shifts = loadRoster(args.input);
const result = lintRoster(shifts, config);
fs.mkdirSync(args.outDir, { recursive: true });
fs.writeFileSync(path.join(args.outDir, "findings.csv"), findingsToCsv(result.findings));
fs.writeFileSync(path.join(args.outDir, "report.md"), buildReport(shifts, result, config));
console.log(`Checked ${shifts.length} shifts for ${result.weekendCounts.size} people`);
console.log(`Findings: ${result.findings.length}`);
for (const t of ["clopen", "overlap", "weekly_hours", "coverage"]) {
  const n = result.findings.filter(f => f.type === t).length;
  if (n) console.log(`${t}: ${n}`);
}
console.log(`Wrote ${path.join(args.outDir, "findings.csv")} and ${path.join(args.outDir, "report.md")}`);
const hasError = result.findings.some(f => f.severity === "error");
process.exit(hasError ? 1 : 0);
