#!/usr/bin/env node
// tools/mc-sweep.mjs — run the v205 Monte Carlo research battery from the
// command line and write one long-format CSV.
//
//   npm run build                         # once, or after code changes
//   node tools/mc-sweep.mjs               # full battery (~2,550 trials)
//   node tools/mc-sweep.mjs --scale 0.2   # quick pilot (seeds × 0.2)
//   node tools/mc-sweep.mjs baseline atcm # only the named configs
//   node tools/mc-sweep.mjs --list        # show config ids and exit
//   node tools/mc-sweep.mjs --out my.csv  # output path (default lps_research_sweep.csv)
//
// Browser resolution order: $CHROME_PATH → puppeteer's bundled Chromium →
// system Chrome (channel:"chrome"). Install one of:
//   npm i -D puppeteer          (bundles Chromium)  — easiest
//   npm i -D puppeteer-core     (uses your installed Chrome via channel)
//
// The runner serves dist/ on a local port, drives the app to the solo setup
// screen, and calls window.__runResearchSweep one config at a time, appending
// rows to the CSV after each config so a crash never loses finished work.
// Seeds are deterministic (base 0x5EED2026, stride 9973): identical commands
// produce identical CSVs.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

// ── The full research battery (see MC_RUN_PLAN.md for the rationale) ──
const BATTERY = {
  baseline:      { seeds: 300, config: { scenarioPreset: "standard",  totalRounds: 12, gridSharingEnabled: true,  gridSharingPermanent: false } },
  grid_off:      { seeds: 200, config: { scenarioPreset: "standard",  totalRounds: 12, gridSharingEnabled: false, gridSharingPermanent: false } },
  grid_perm:     { seeds: 200, config: { scenarioPreset: "standard",  totalRounds: 12, gridSharingEnabled: true,  gridSharingPermanent: true  } },
  cooperative:   { seeds: 200, config: { scenarioPreset: "nocombat",  totalRounds: 12, gridSharingEnabled: true  } },
  atcm:          { seeds: 200, config: { scenarioPreset: "atcm",      totalRounds: 16, gridSharingEnabled: true  } },
  itu:           { seeds: 200, config: { scenarioPreset: "itu",       totalRounds: 12, gridSharingEnabled: true  } },
  strategic_res: { seeds: 200, config: { scenarioPreset: "strategic_reserve", totalRounds: 20, gridSharingEnabled: true } },
  first_mover:   { seeds: 300, config: { scenarioPreset: "sprint",    totalRounds: 4,  gridSharingEnabled: true  } },
  arrival_d2:    { seeds: 150, config: { scenarioPreset: "unevenArrival", totalRounds: 20, arrivalDelay: 2,  gridSharingEnabled: true } },
  arrival_d5:    { seeds: 150, config: { scenarioPreset: "unevenArrival", totalRounds: 20, arrivalDelay: 5,  gridSharingEnabled: true } },
  arrival_d10:   { seeds: 150, config: { scenarioPreset: "unevenArrival", totalRounds: 20, arrivalDelay: 10, gridSharingEnabled: true } },
  arrival_d20:   { seeds: 150, config: { scenarioPreset: "unevenArrival", totalRounds: 20, arrivalDelay: 20, gridSharingEnabled: true } },
  long_horizon:  { seeds: 150, config: { scenarioPreset: "longhaul",  totalRounds: 20, gridSharingEnabled: true } },
};

// ── CLI ──
const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v ?? dflt;
};
const has = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
if (has("list")) {
  for (const [id, b] of Object.entries(BATTERY))
    console.log(`${id.padEnd(14)} seeds=${String(b.seeds).padStart(3)}  ${JSON.stringify(b.config)}`);
  process.exit(0);
}
const OUT = path.resolve(flag("out", "lps_research_sweep.csv"));
const SCALE = parseFloat(flag("scale", "1"));
const TIMESERIES = has("timeseries");
const VERIFY = has("verify");
const PORT = parseInt(flag("port", "4199"), 10);
// --verify: run a fixed 10-seed baseline and print a canonical SHA-256 of the
// trials CSV. Same build + same seeds should reproduce the identical hash on
// any machine IF the JS engine's floating point matches; if hashes differ but
// the printed aggregates agree to <0.1%, the difference is engine math, not
// the model — report both alongside the browser version when comparing.
const ids = VERIFY ? ["baseline"] : (argv.length ? argv : Object.keys(BATTERY));
for (const id of ids) if (!BATTERY[id]) { console.error(`unknown config "${id}" — try --list`); process.exit(1); }

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

// ── static server ──
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".json":"application/json" };
const server = http.createServer((req, res) => {
  let f = path.join(DIST, req.url.split("?")[0]);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  res.setHeader("Content-Type", MIME[path.extname(f)] || "application/octet-stream");
  fs.createReadStream(f).pipe(res);
}).listen(PORT, "127.0.0.1");

// ── browser resolution ──
async function launchBrowser() {
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--headless=new"];
  let puppeteer;
  try { puppeteer = (await import("puppeteer")).default; }
  catch { puppeteer = (await import("puppeteer-core")).default; }
  if (process.env.CHROME_PATH) {
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, args, headless: true });
  }
  try { return await puppeteer.launch({ args, headless: true }); }               // bundled
  catch { return puppeteer.launch({ channel: "chrome", args, headless: true }); } // system Chrome
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("  [page error]", String(e).slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2" });
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Continue solo"));
    b && b.click();
  });
  await sleep(1500);
  const ok = await page.evaluate(() => typeof window.__runResearchSweep === "function");
  if (!ok) { console.error("sweep hook not found — is this a v205+ build?"); process.exit(1); }

  const engine = await browser.version().catch(() => "unknown");
  if (VERIFY) {
    const entry = { id: "verify", ...BATTERY.baseline, seeds: 10 };
    const csv = await page.evaluate(async (e) => window.__runResearchSweep([e], { download: false }), entry);
    const { createHash } = await import("node:crypto");
    const body = csv.split("\n").slice(1).join("\n"); // header-independent
    const sha = createHash("sha256").update(body).digest("hex");
    const rows = csv.trim().split("\n").slice(1).map(r => r.split(","));
    const col = (name) => csv.split("\n")[0].split(",").indexOf(name);
    const sum = (c) => rows.reduce((s, r) => s + parseFloat(r[col(c)] || 0), 0);
    console.log("verify battery : baseline × 10 fixed seeds");
    console.log("engine         :", engine);
    console.log("trials sha256  :", sha);
    console.log("aggregates     : score1_sum=" + sum("score1").toFixed(1),
                " ice_sum=" + (sum("ice1_kg") + sum("ice2_kg")).toFixed(1),
                " vio_sum=" + (sum("vio1") + sum("vio2")).toFixed(2));
    console.log("reference (build 2.7.213, container V8): see VERIFY.md");
    await browser.close(); server.close(); process.exit(0);
  }
  const totalTrials = ids.reduce((s, id) => s + Math.max(10, Math.round(BATTERY[id].seeds * SCALE)), 0);
  console.log(`Running ${ids.length} config(s), ~${totalTrials} trials → ${OUT}`);
  const t0 = Date.now();
  let wroteHeader = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8").trim().length > 0;
  let done = 0;

  for (const id of ids) {
    const entry = { id, ...BATTERY[id], seeds: Math.max(10, Math.round(BATTERY[id].seeds * SCALE)) };
    process.stdout.write(`  ${id.padEnd(14)} ${String(entry.seeds).padStart(4)} seeds … `);
    const tc = Date.now();
    const res = await page.evaluate(
      async (e, ts) => window.__runResearchSweep([e], { download: false, timeseries: ts }),
      entry, TIMESERIES
    );
    const csv = typeof res === "string" ? res : res.trialsCsv;
    const lines = csv.split("\n");
    fs.appendFileSync(OUT, (wroteHeader ? "\n" + lines.slice(1).join("\n") : csv));
    if (TIMESERIES && res.roundsCsv) {
      const rOut = OUT.replace(/\.csv$/, "") + "_rounds.csv";
      const rLines = res.roundsCsv.split("\n");
      const rExists = fs.existsSync(rOut) && fs.readFileSync(rOut, "utf8").trim().length > 0;
      fs.appendFileSync(rOut, rExists ? "\n" + rLines.slice(1).join("\n") : res.roundsCsv);
    }
    wroteHeader = true;
    done += entry.seeds;
    const dt = (Date.now() - tc) / 1000;
    const eta = ((totalTrials - done) * (Date.now() - t0)) / Math.max(1, done) / 1000;
    console.log(`done in ${dt.toFixed(0)}s  (eta ${Math.ceil(eta / 60)} min)`);
  }
  console.log(`\n${done} trials in ${((Date.now() - t0) / 60000).toFixed(1)} min → ${OUT}`);
  await browser.close();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
