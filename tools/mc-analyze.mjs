#!/usr/bin/env node
// tools/mc-analyze.mjs — turn a research-sweep CSV into a stats report.
//
//   node tools/mc-analyze.mjs lps_research_sweep.csv
//   node tools/mc-analyze.mjs sweep.csv --baseline baseline --md report.md
//
// Per battery config: n, Actor I win rate ±CI95, mean scores, total ice,
// violations per round, stranding / rescue / deposit-block telemetry — plus
// PAIRED deltas vs the baseline config. Because every config runs the same
// deterministic seed sequence, trials with equal seeds are matched pairs;
// the paired-delta CI is computed on per-seed differences, which is far
// tighter than comparing independent means.
//
// No dependencies; the same CSV the app and mc-sweep.mjs emit.

import fs from "node:fs";

const argv = process.argv.slice(2);
const flag = (n, d = null) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const BASE = flag("baseline", "baseline");
const MD = flag("md", null);
const ROUNDS = flag("rounds", null);
const file = argv[0];
if (!file || !fs.existsSync(file)) { console.error("usage: node tools/mc-analyze.mjs <sweep.csv> [--baseline id] [--md out.md]"); process.exit(1); }

// tiny CSV reader (no quoted fields in our exports)
const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split("\n");
const cols = head.split(",");
const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
const num = (row, c) => { const v = row[idx[c]]; const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const rows = lines.map(l => l.split(",")).filter(r => r.length === cols.length);
if (idx.battery_id == null) { console.error("not a sweep CSV (no battery_id column) — batch-trials CSVs work too if you add one."); process.exit(1); }

const byBattery = new Map();
for (const r of rows) {
  const b = r[idx.battery_id];
  if (!byBattery.has(b)) byBattery.set(b, []);
  byBattery.get(b).push(r);
}

const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ci95 = a => 1.96 * sd(a) / Math.max(1, Math.sqrt(a.length));
const pct = x => (100 * x).toFixed(1) + "%";
const f0 = x => x.toFixed(0), f1 = x => x.toFixed(1), f2 = x => x.toFixed(2);

const metrics = (trials) => ({
  n: trials.length,
  p1win: trials.filter(r => num(r, "winner") === 1).length / trials.length,
  score1: trials.map(r => num(r, "score1")),
  score2: trials.map(r => num(r, "score2")),
  gap: trials.map(r => num(r, "score_gap")),
  ice: trials.map(r => num(r, "ice1_kg") + num(r, "ice2_kg")),
  vioPerRound: trials.map(r => (num(r, "vio1") + num(r, "vio2")) / Math.max(1, num(r, "total_rounds"))),
  strandRate: trials.filter(r => num(r, "stranded1") + num(r, "stranded2") > 0).length / trials.length,
  rescues: trials.map(r => num(r, "rescues1") + num(r, "rescues2")),
  strandPenDays: trials.map(r => num(r, "strand_pen_days1") + num(r, "strand_pen_days2")),
  blockRate: trials.filter(r => num(r, "dep_blocked1") + num(r, "dep_blocked2") > 0).length / trials.length,
  extractedPct: trials.map(r => num(r, "extracted_pct")),
  seeds: new Map(trials.map(r => [r[idx.seed], r])),
});

const base = byBattery.has(BASE) ? metrics(byBattery.get(BASE)) : null;

const out = [];
const P = s => { out.push(s); };
P(`# Monte Carlo sweep report`);
P(`Source: ${file} · ${rows.length} trials · ${byBattery.size} configs · baseline: ${BASE}${base ? "" : " (NOT FOUND — paired deltas skipped)"}`);
P("");
P(`| config | n | P1 win | score1 ±CI | score gap | ice kg | vio/round | strand% | rescues | blocked% | extr% |`);
P(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const [b, trials] of byBattery) {
  const m = metrics(trials);
  P(`| ${b} | ${m.n} | ${pct(m.p1win)} | ${f0(mean(m.score1))} ±${f0(ci95(m.score1))} | ${f0(mean(m.gap))} | ${f0(mean(m.ice))} | ${f1(mean(m.vioPerRound))} | ${pct(m.strandRate)} | ${f2(mean(m.rescues))} | ${pct(m.blockRate)} | ${f2(mean(m.extractedPct))} |`);
}
P("");

if (base) {
  P(`## Paired deltas vs ${BASE} (matched by seed)`);
  P("");
  P(`| config | paired n | Δ ice kg ±CI | Δ vio/round ±CI | Δ score1 ±CI | verdict |`);
  P(`|---|---:|---:|---:|---:|---|`);
  for (const [b, trials] of byBattery) {
    if (b === BASE) continue;
    const m = metrics(trials);
    const dIce = [], dVio = [], dS1 = [];
    for (const [seed, r] of m.seeds) {
      const br = base.seeds.get(seed);
      if (!br) continue;
      dIce.push((num(r, "ice1_kg") + num(r, "ice2_kg")) - (num(br, "ice1_kg") + num(br, "ice2_kg")));
      dVio.push(
        (num(r, "vio1") + num(r, "vio2")) / Math.max(1, num(r, "total_rounds"))
        - (num(br, "vio1") + num(br, "vio2")) / Math.max(1, num(br, "total_rounds")));
      dS1.push(num(r, "score1") - num(br, "score1"));
    }
    if (dIce.length === 0) { P(`| ${b} | 0 | — | — | — | no shared seeds |`); continue; }
    const sig = (arr) => Math.abs(mean(arr)) > ci95(arr) ? "significant" : "n.s.";
    P(`| ${b} | ${dIce.length} | ${f0(mean(dIce))} ±${f0(ci95(dIce))} | ${f2(mean(dVio))} ±${f2(ci95(dVio))} | ${f0(mean(dS1))} ±${f0(ci95(dS1))} | vio ${sig(dVio)} · ice ${sig(dIce)} |`);
  }
  P("");
  P(`_Paired CIs use per-seed differences; "significant" = |Δ| exceeds its own 95% CI. Configs with different round counts compare violations per round._`);
}

if (ROUNDS && fs.existsSync(ROUNDS)) {
  const [rh, ...rl] = fs.readFileSync(ROUNDS, "utf8").trim().split("\n");
  const rc = rh.split(","); const ri = Object.fromEntries(rc.map((c, i) => [c, i]));
  const rrows = rl.map(l => l.split(",")).filter(r => r.length === rc.length);
  const byB = new Map();
  for (const r of rrows) {
    const b = r[ri.battery_id]; if (!byB.has(b)) byB.set(b, []); byB.get(b).push(r);
  }
  P(`## Round trends (early / mid / late terciles)`);
  P("");
  P(`| config | rounds | Δvio E/M/L | Δice E/M/L | contested E/M/L | depleted E/M/L |`);
  P(`|---|---:|---|---|---|---|`);
  for (const [b, rr] of byB) {
    const maxR = Math.max(...rr.map(r => parseInt(r[ri.round], 10)));
    const terc = (r) => { const x = parseInt(r[ri.round], 10); return x <= maxR / 3 ? 0 : x <= (2 * maxR) / 3 ? 1 : 2; };
    const agg = [[], [], []].map(() => ({ vio: [], ice: [], con: [], dep: [] }));
    for (const r of rr) {
      const t = agg[terc(r)];
      t.vio.push(parseFloat(r[ri.d_vio]) || 0);
      t.ice.push(parseFloat(r[ri.d_ice]) || 0);
      t.con.push(parseFloat(r[ri.d_contested]) || 0);
      t.dep.push(parseFloat(r[ri.craters_depleted]) || 0);
    }
    const tri = (k, dp = 1) => agg.map(t => mean(t[k]).toFixed(dp)).join(" / ");
    P(`| ${b} | 1–${maxR} | ${tri("vio")} | ${tri("ice", 0)} | ${tri("con", 2)} | ${tri("dep", 1)} |`);
  }
  P("");
  P(`_Per-round means within each tercile of the session. Rising Δvio or contested with rising depleted = scarcity-driven friction (the R6 hypothesis)._`);
}

const report = out.join("\n");
console.log(report);
if (MD) { fs.writeFileSync(MD, report + "\n"); console.error(`\nwritten → ${MD}`); }
