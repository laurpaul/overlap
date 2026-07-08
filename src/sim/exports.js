// ── Export helpers (pure) ───────────────────────────────────────────────────
//
// Text/JSON formatters for "save game state" actions in App.jsx. Pure
// functions: take the live game state in, return a string. App.jsx wraps
// each with a downloadBlob call; that's the only side effect.

import { DAYS_PER_ROUND, PIXELS_PER_KM, MAP_KM_PER_PX, W, H, SAFETY_RADIUS, ZONE_KM, ZONE_RADII_PX, ZONE_DISPLAY_SCALE, COMSAT_RELAY_RADIUS, ZONE_TIERS, TIER_KEYS, TIER_SCALE_BOUNDS, TIER_OVERREACH_WEIGHT } from "./constants.js";
import { effectiveEarthVis, isInCommsBlackoutFor, CRATER_DATA } from "./mapData.js";
import { scorePlayerState, scoreBreakdown, zoneOverreach, zoneAssetCount, overreachPenalty, effectiveTierScales, SCORE_PTS_PER_KG, SCORE_PTS_PER_AP, SCORE_PENALTY_VIO, SCORE_CARRY_FRACTION } from "./economy.js";
import { coordinationIntrusions, attributeSafetyViolationsN } from "./enemyZones.js";
import { craterName } from "./labels.js";

// Build the one-page round-summary text used by the workshop facilitators'
// "R{N} SUMMARY" button. Format is plain ASCII art, designed to print
// well in monospace fonts and read well on screen.
//
// Inputs:
//   round, day, globalDay -- current round counters
//   p1, p2 -- player state objects (nullable for p2 in single-actor / pre-arrival)
//   activeViolations -- array of { owner, type, radiusKm, violatorCount }
//   missionLog -- array of { round, day, label, type }
export function buildRoundSummaryText({
  round, day, globalDay,
  p1, p2,
  activeViolations,
  missionLog,
}) {
  const lines = [];
  const W_LINE = "═".repeat(60);
  lines.push(W_LINE);
  lines.push(`  LUNAR POLICY SANDBOX · ROUND ${round} SUMMARY`);
  lines.push(`  Day ${day + 1} of ${DAYS_PER_ROUND} · Global day ${globalDay + 1}`);
  lines.push(`  ${new Date().toLocaleString()}`);
  lines.push(W_LINE);

  const summarize = (p, label) => {
    if (!p) return;
    lines.push("");
    lines.push(`  ${label}${p.stakeholderName ? ` (${p.stakeholderName})` : ""}`);
    lines.push("  " + "─".repeat(56));
    const score = scorePlayerState(p);
    const carried = (p.ice || 0) + (p.extraRovers || []).reduce((s, er) => s + (er?.ice || 0), 0);
    // Pluralize per-asset counts so "3 panels" doesn't print as "3 panel".
    const plur = (n, sing) => `${n} ${sing}${n === 1 ? "" : "s"}`;
    const rovers = 1 + (p.extraRovers || []).length;
    const rows = [
      [`Score`,             `${Math.round(score)}`],
      [`Ice deposited`,     `${Math.round(p.iceDeposited || 0)} kg`],
      [`Ice carried`,       `${Math.round(carried)} kg (half-weight)`],
      [`Asset points`,      `${p.assetPts || 0}`],
      [`Budget`,            `${Math.round(p.budget || 0)} cr`],
      [`Safety violations`, `${p.safetyViolations || 0} (× −25)`],
      [`Infrastructure`,    [
        plur(p.panels.length,            "panel"),
        plur((p.reactors    || []).length, "reactor"),
        plur((p.habitats    || []).length, "habitat"),
        plur(rovers,                       "rover"),
        plur((p.landingPads || []).length, "pad"),
        plur((p.comsats     || []).length, "comsat"),
      ].join(" · ")],
    ];
    for (const [k, v] of rows) {
      lines.push(`    ${k.padEnd(22)} ${v}`);
    }
  };
  summarize(p1, "ACTOR I");
  summarize(p2, "ACTOR II");

  // Active violations
  if (activeViolations && activeViolations.length > 0) {
    lines.push("");
    lines.push(`  ACTIVE AREA VIOLATIONS (${activeViolations.length})`);
    lines.push("  " + "─".repeat(56));
    for (const v of activeViolations) {
      lines.push(`    • ${v.owner} ${v.type} zone (${v.radiusKm} km) -- ${v.violatorCount} breach${v.violatorCount === 1 ? "" : "es"}`);
    }
  }

  // Comms blackout census
  const blackoutLines = [];
  for (const [pi, p] of [[0, p1], [1, p2]]) {
    if (!p) continue;
    const owner = pi === 0 ? "ACTOR I" : "ACTOR II";
    const csList = p.comsats || [];
    if (p.x != null && p.y != null && isInCommsBlackoutFor(p.x, p.y, csList)) {
      blackoutLines.push(`    • ${owner} Rover 1 -- ${(effectiveEarthVis(p.x, p.y, csList) * 100).toFixed(0)}% DTE`);
    }
    (p.extraRovers || []).forEach((er, i) => {
      if (!er) return;
      if (isInCommsBlackoutFor(er.x, er.y, csList)) {
        blackoutLines.push(`    • ${owner} Rover ${i + 2} -- ${(effectiveEarthVis(er.x, er.y, csList) * 100).toFixed(0)}% DTE`);
      }
    });
  }
  if (blackoutLines.length > 0) {
    lines.push("");
    lines.push(`  COMMS BLACKOUT (${blackoutLines.length})`);
    lines.push("  " + "─".repeat(56));
    lines.push(...blackoutLines);
  }

  // Round events from mission log
  const roundEvents = (missionLog || []).filter(e => e.round === round);
  if (roundEvents.length > 0) {
    lines.push("");
    lines.push(`  EVENTS THIS ROUND (${roundEvents.length})`);
    lines.push("  " + "─".repeat(56));
    for (const e of roundEvents.slice(-20)) {
      lines.push(`    D${(e.day || 0) + 1}  ${e.label || e.type}`);
    }
    if (roundEvents.length > 20) {
      lines.push(`    … ${roundEvents.length - 20} earlier events truncated`);
    }
  }

  lines.push("");
  lines.push(W_LINE);
  // v27 note: this version literal must be kept in sync with
  // package.json's `version` field. Workshop summaries appear in
  // facilitator hand-outs and exports; we don't want a stale label.
  lines.push("  Open Lunar Foundation · Overlap v2.7");
  lines.push(W_LINE);

  return lines.join("\n");
}

// Build the CSV text for the workshop mission-log export. Includes a
// header row plus one row per logged event. Numeric kg values are
// formatted to 2 decimal places to match the original behavior.
//
// v172: proper RFC-4180 escaping (labels routinely contain commas, which
// previously corrupted the file) and DYNAMIC columns, every field any event
// carries gets a column, so no detail is dropped.
function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) { return cells.map(csvCell).join(","); }

export function buildMissionLogCsv(missionLog) {
  const log = missionLog || [];
  // Stable preferred order up front; any other keys present on any event are
  // appended so nothing is silently dropped.
  const preferred = ["round", "day", "globalDay", "type", "actor", "itemType", "cost", "kg", "craterIdx", "x", "y", "seq", "label"];
  const seen = new Set(preferred);
  const extra = [];
  for (const e of log) for (const k of Object.keys(e)) if (!seen.has(k)) { seen.add(k); extra.push(k); }
  const cols = [...preferred, ...extra];
  const rows = [
    csvRow(cols),
    ...log.map(e => csvRow(cols.map(c => {
      if (c === "kg") return (e.kg == null) ? "" : Number(e.kg).toFixed(2);
      return e[c];
    }))),
  ];
  return rows.join("\n");
}

// v173: flat per-actor metric snapshot, every number for one actor at one
// instant, as a plain object. Used both to enrich the per-round history (so the
// export is a real longitudinal series) and for the live "current" rows.
export function actorMetricSnapshot(p) {
  if (!p) return null;
  const bd = scoreBreakdown(p);
  const term = (k) => { const t = bd.terms.find(x => x.key === k); return t ? Math.round(t.value) : 0; };
  const carried = (p.ice || 0) + (p.volatiles || 0)
    + (p.extraRovers || []).reduce((s, er) => s + (er?.ice || 0) + (er?.volatiles || 0), 0);
  return {
    stakeholder: p.stakeholderName || "",
    score: Math.round(bd.total),
    score_banked: term("banked"), score_carried: term("carried"),
    score_infrastructure: term("assets"), score_policy: term("policy"), score_penalty: term("penalty"),
    iceDeposited_kg: Math.round(p.iceDeposited || 0), iceCarried_kg: Math.round(carried),
    budget_cr: Math.round(p.budget || 0), econ_E: p.econ == null ? "" : Number(p.econ).toFixed(2),
    rdAccum: Math.round(p.rdAccum || 0), milStock: Math.round(p.milStock || 0),
    assetPts: p.assetPts || 0, safetyViolations: p.safetyViolations || 0,
    stance: p.allocPreset || "", zoneScale: p.zoneScale ?? 1,
    easementsGranted: (p.easements || []).join("|"), treatyFloor: p.treatyFloor ?? "",
    panels: (p.panels || []).length, reactors: (p.reactors || []).length,
    habitats: (p.habitats || []).length, rovers: 1 + (p.extraRovers || []).length,
    pads: (p.landingPads || []).length, comsats: (p.comsats || []).length,
  };
}

// v173: the DETAILED export, a single, flat, directly-loadable CSV. One row per
// (round, actor): the full longitudinal metric series across the whole game, plus
// a final "current" row per actor for the in-progress round. Loads straight into
// pandas / a spreadsheet with no section-splitting. Rows for rounds recorded
// before the metric-rich history upgrade fall back to the economic fields that
// were captured then (ice deposited + budget), leaving the rest blank.
const DETAIL_COLS = [
  "round", "phase", "day", "globalDay", "actor", "stakeholder", "score",
  "score_banked", "score_carried", "score_infrastructure", "score_policy", "score_penalty",
  "iceDeposited_kg", "iceCarried_kg", "budget_cr", "econ_E", "rdAccum", "milStock",
  "assetPts", "safetyViolations", "coordAdvisories", "stance", "zoneScale",
  "easementsGranted", "treatyFloor", "panels", "reactors", "habitats", "rovers",
  "pads", "comsats", "powerGrid", "commsGrid", "simMode", "scenario", "version",
];
const SNAP_KEYS = [
  "stakeholder", "score", "score_banked", "score_carried", "score_infrastructure",
  "score_policy", "score_penalty", "iceDeposited_kg", "iceCarried_kg", "budget_cr",
  "econ_E", "rdAccum", "milStock", "assetPts", "safetyViolations",
];
const SNAP_KEYS2 = ["stance", "zoneScale", "easementsGranted", "treatyFloor",
  "panels", "reactors", "habitats", "rovers", "pads", "comsats"];

export function buildDetailedCsv({
  history, p1, p2, round, day, globalDay,
  simMode, scenarioPreset, version, powerGridState, commsGridState,
}) {
  const rows = [csvRow(DETAIL_COLS)];
  const emit = (rnd, phase, dy, gday, actor, snap, adv, grids) => {
    const r = { round: rnd, phase, day: dy, globalDay: gday, actor, coordAdvisories: adv,
      powerGrid: grids?.power ?? "", commsGrid: grids?.comms ?? "",
      simMode: simMode ?? "", scenario: scenarioPreset ?? "", version: version ?? "" };
    if (snap) for (const k of [...SNAP_KEYS, ...SNAP_KEYS2]) r[k] = snap[k];
    rows.push(csvRow(DETAIL_COLS.map(c => r[c] ?? "")));
  };

  // Historical rounds (from enriched history; legacy entries fall back partially).
  for (const h of (history || [])) {
    const grids = { power: h.powerGrid ?? "", comms: h.commsGrid ?? "" };
    const legacy = (dep, bud) => ({ iceDeposited_kg: dep, budget_cr: bud });
    emit(h.r, "round_end", "", "", "ACTOR_I", h.m1 || legacy(h.d1, h.bud1), h.adv1 ?? "", grids);
    if (h.m2 || h.d2 != null) emit(h.r, "round_end", "", "", "ACTOR_II", h.m2 || legacy(h.d2, h.bud2), h.adv2 ?? "", grids);
  }

  // Current (in-progress) snapshot.
  let adv = { a1: "", a2: "" };
  try { const a = coordinationIntrusions(p1, p2, {}); adv = { a1: a.a1, a2: a.a2 }; } catch { /* ignore */ }
  const grids = { power: powerGridState?.mode ?? "", comms: commsGridState?.mode ?? "" };
  emit(round, "current", day, globalDay, "ACTOR_I", actorMetricSnapshot(p1), adv.a1, grids);
  if (p2) emit(round, "current", day, globalDay, "ACTOR_II", actorMetricSnapshot(p2), adv.a2, grids);

  return rows.join("\n");
}

// v172: comprehensive multi-section session export (kept available as a richer
// alternative). A single .csv that encodes
// as much of the session state as can be captured: meta, per-actor metrics with
// the full score breakdown, a long-format score-term table, a per-asset
// inventory (positions in px AND km, health, placement seq), per-round economic
// history, and the complete escaped event log. Sections are delimited by
// `# === NAME ===` marker rows (split on those to load each as its own frame).
export function buildSessionCsv({
  round, day, globalDay, totalRounds, simMode, scenarioPreset, version,
  p1, p2, history, missionLog,
  powerGridState, commsGridState,
}) {
  const out = [];
  const section = (name) => { out.push(""); out.push(`# === ${name} ===`); };
  const KM_PER_PX = 1 / PIXELS_PER_KM;
  const num = (v, d = 0) => (v == null || isNaN(v)) ? "" : Number(v).toFixed(d);

  // 1) SESSION META ─────────────────────────────────────────────────────────
  section("SESSION");
  out.push(csvRow(["key", "value"]));
  for (const kv of [
    ["timestamp", new Date().toISOString()],
    ["version", version || ""],
    ["round", round], ["day", day], ["globalDay", globalDay],
    ["totalRounds", totalRounds ?? ""], ["simMode", simMode ?? ""],
    ["scenarioPreset", scenarioPreset ?? ""],
    ["powerGrid", powerGridState?.mode ?? ""],
    ["commsGrid", commsGridState?.mode ?? ""],
  ]) out.push(csvRow(kv));

  // 2) PER-ACTOR METRICS ────────────────────────────────────────────────────
  let advisories = { a1: 0, a2: 0 };
  try { advisories = coordinationIntrusions(p1, p2, {}); } catch { /* ignore */ }
  section("ACTORS");
  const actorCols = ["actor", "stakeholder", "active", "score",
    "score_banked", "score_carried", "score_infrastructure", "score_policy", "score_penalty",
    "iceDeposited_kg", "iceCarried_kg", "budget_cr", "econ_E", "rdAccum", "milStock",
    "assetPts", "safetyViolations", "coordAdvisories", "stance", "zoneScale",
    "easementsGranted", "treatyFloor",
    "panels", "reactors", "habitats", "rovers", "pads", "comsats", "roverX_px", "roverY_px"];
  out.push(csvRow(actorCols));
  const actorRow = (p, label, adv) => {
    if (!p) { out.push(csvRow([label, "", "false"])); return; }
    const bd = scoreBreakdown(p);
    const term = (k) => { const t = bd.terms.find(x => x.key === k); return t ? Math.round(t.value) : 0; };
    const carried = (p.ice || 0) + (p.volatiles || 0)
      + (p.extraRovers || []).reduce((s, er) => s + (er?.ice || 0) + (er?.volatiles || 0), 0);
    out.push(csvRow([
      label, p.stakeholderName || "", p.active === false ? "false" : "true",
      Math.round(bd.total), term("banked"), term("carried"), term("assets"), term("policy"), term("penalty"),
      Math.round(p.iceDeposited || 0), Math.round(carried), Math.round(p.budget || 0),
      num(p.econ, 2), Math.round(p.rdAccum || 0), Math.round(p.milStock || 0),
      p.assetPts || 0, p.safetyViolations || 0, adv,
      p.allocPreset || "", p.zoneScale ?? 1, (p.easements || []).join("|"), p.treatyFloor ?? "",
      (p.panels || []).length, (p.reactors || []).length, (p.habitats || []).length,
      1 + (p.extraRovers || []).length, (p.landingPads || []).length, (p.comsats || []).length,
      p.x ?? "", p.y ?? "",
    ]));
  };
  actorRow(p1, "ACTOR_I", advisories.a1);
  actorRow(p2, "ACTOR_II", advisories.a2);

  // 3) SCORE BREAKDOWN (long format) ─────────────────────────────────────────
  section("SCORE_BREAKDOWN");
  out.push(csvRow(["actor", "term", "value", "detail"]));
  for (const [label, p] of [["ACTOR_I", p1], ["ACTOR_II", p2]]) {
    if (!p) continue;
    for (const t of scoreBreakdown(p).terms) out.push(csvRow([label, t.label, Math.round(t.value), t.detail]));
  }

  // 4) ASSET INVENTORY ──────────────────────────────────────────────────────
  section("ASSETS");
  out.push(csvRow(["actor", "type", "index", "x_px", "y_px", "x_km", "y_km", "health", "seq", "destroyed"]));
  const emitAssets = (p, label) => {
    if (!p) return;
    const sh = p.structureHealth || {};
    const push = (type, pt, idx, h) => {
      if (!pt || pt.x == null) return;
      const hh = h == null ? 1 : h;
      out.push(csvRow([label, type, idx, Math.round(pt.x), Math.round(pt.y),
        num(pt.x * KM_PER_PX, 2), num(pt.y * KM_PER_PX, 2), num(hh, 3), pt.seq ?? "",
        hh <= 0.1 ? "true" : "false"]));
    };
    (p.panels || []).forEach((s, i) => push("solar", s, i, sh.panels?.[i]));
    (p.reactors || []).forEach((s, i) => push("reactor", s, i, sh.reactors?.[i]));
    (p.habitats || []).forEach((s, i) => push("habitat", s, i, sh.habitats?.[i]));
    (p.landingPads || []).forEach((s, i) => push("pad", s, i, sh.landingPads?.[i]));
    (p.comsats || []).forEach((s, i) => push("comsat", s, i, 1));
    if (p.x != null) push("rover", { x: p.x, y: p.y, seq: p.foundingSeq }, 0, 1);
    (p.extraRovers || []).forEach((er, i) => push("rover", er, i + 1, sh.extraRovers?.[i]));
  };
  emitAssets(p1, "ACTOR_I");
  emitAssets(p2, "ACTOR_II");

  // 5) PER-ROUND HISTORY (dynamic columns) ───────────────────────────────────
  section("ROUND_HISTORY");
  const hist = history || [];
  if (hist.length) {
    const hcols = Array.from(hist.reduce((set, h) => { Object.keys(h).forEach(k => set.add(k)); return set; }, new Set()));
    out.push(csvRow(hcols));
    for (const h of hist) out.push(csvRow(hcols.map(c => h[c] ?? "")));
  } else {
    out.push(csvRow(["(no completed rounds yet)"]));
  }

  // 6) FULL EVENT LOG ────────────────────────────────────────────────────────
  section("EVENT_LOG");
  out.push(buildMissionLogCsv(missionLog));

  return out.join("\n");
}

// Build the JSON object for the workshop state-snapshot export. Pure
// (returns a plain object); App.jsx wraps it in JSON.stringify + Blob.
// This is a DIGEST of state, not a full reload-from-disk snapshot --
// player asset counts are flattened to numbers (e.g. panels: 3 rather
// than the full {x,y} array).
//
// Inputs:
//   round, day, globalDay, totalRounds, simMode -- session meta
//   p1, p2 -- player state objects (nullable for p2)
//   history -- per-round economic summary array
//   missionLog -- full event log
//   annotations -- user-placed map pins
//   powerGridState -- diplomacy/grid state
//   craterHealth -- Float32Array of crater health values
//   physOverrides -- facilitator physics tuning
export function buildMissionStateJson({
  round, day, globalDay, totalRounds, simMode,
  p1, p2,
  history, missionLog, annotations,
  powerGridState,
  cratersTotal, craterHealth,
  physOverrides,
}) {
  const cratersHeavilyDepleted = craterHealth
    ? Array.from(craterHealth).filter(h => (h ?? 1) < 0.2).length
    : 0;
  const playerDigest = (p) => p ? {
    iceDeposited: p.iceDeposited,
    assetPts: p.assetPts,
    budget: p.budget,
    econ: p.econ,
    rdAccum: p.rdAccum,
    milStock: p.milStock,
    panels: p.panels.length,
    reactors: (p.reactors || []).length,
    habitats: (p.habitats || []).length,
    rovers: 1 + (p.extraRovers || []).length,
    pads: (p.landingPads || []).length,
  } : null;
  return {
    meta: { round, day, globalDay, totalRounds, simMode, timestamp: new Date().toISOString() },
    p1: playerDigest(p1),
    p2: playerDigest(p2),
    history,
    missionLog,
    annotations,
    powerGridState,
    cratersTotal,
    cratersHeavilyDepleted,
    physOverrides,
  };
}

// ── v178: full-reconstruction export ────────────────────────────────────────
// The most detailed CSV the sandbox produces: enough to rebuild the game, not
// just summarize it. One file, sections delimited by `# === NAME ===` marker
// rows (split on those to load each as its own DataFrame). Sections:
//   SESSION            meta (round/day, grids, mode, version, timestamp)
//   INITIAL_CONDITIONS scenario, totalRounds, claim radii, map scale, physics
//                      overrides, and each actor's starting base position
//   CRATERS            static reference: every crater's index, name, position
//                      (px+km), quality and size, needed to read craterIdx in
//                      the event log and the per-round CRATER_STATE
//   ACTORS             current per-actor metrics + full score breakdown
//   ASSETS             every placed asset: type, index, position (px+km),
//                      health, placement round/day/seq (cross-referenced from
//                      the event log), and declared safety radius (km)
//   METRICS_BY_ROUND   the flat longitudinal metric series (buildDetailedCsv)
//   ROVER_TRACE        per DAY (frame-by-frame) when a tick trace is present,
//                      else per round: each rover's position (px+km), ice,
//                      power, and status
//   CRATER_STATE       per DAY (else per round): each crater's remaining health
//   EVENT_LOG          the complete structured action log (every placement,
//                      mine, deposit, deal, grid action, diplomacy, inject …)
const KM = MAP_KM_PER_PX;
const kmOf = (px) => (px == null || isNaN(px)) ? "" : Number(px * KM).toFixed(2);

// Index placement-type events by "itemType@x,y" so an asset's current position
// can be matched back to the round/day/seq it was placed.
function placementIndex(missionLog) {
  const idx = new Map();
  for (const e of (missionLog || [])) {
    if ((e.type === "placement" || e.type === "place" || e.type === "setup") && e.x != null) {
      const key = `${e.itemType || "base"}@${Math.round(e.x)},${Math.round(e.y)}`;
      // First placement at a spot wins (a later move would log its own event).
      if (!idx.has(key)) idx.set(key, { round: e.round, day: e.day, seq: e.seq });
    }
  }
  return idx;
}

export function buildReconstructionCsv({
  round, day, globalDay, totalRounds, simMode, scenarioPreset, version,
  p1, p2, p3 = null, history, missionLog,
  powerGridState, commsGridState, claimR, physOverrides,
  tickTrace,
}) {
  const out = [];
  const section = (name) => { out.push(""); out.push(`# === ${name} ===`); };
  const placedAt = placementIndex(missionLog);
  // v192: present actors, in seat order. Supports 2- or 3-actor sessions; every
  // per-actor and pairwise section below iterates this list.
  const ACTORS = [["ACTOR_I", p1], ["ACTOR_II", p2], ["ACTOR_III", p3]].filter(([, p]) => p != null);

  // 1) SESSION ────────────────────────────────────────────────────────────
  section("SESSION");
  out.push(csvRow(["key", "value"]));
  for (const kv of [
    ["timestamp", new Date().toISOString()],
    ["version", version || ""],
    ["round", round], ["day", day], ["globalDay", globalDay],
    ["totalRounds", totalRounds ?? ""], ["simMode", simMode ?? ""],
    ["scenarioPreset", scenarioPreset ?? ""],
    ["powerGrid", powerGridState?.mode ?? ""], ["commsGrid", commsGridState?.mode ?? ""],
    ["daysPerRound", DAYS_PER_ROUND],
  ]) out.push(csvRow(kv));

  // 1b) CONFIG_CONSTANTS, the ruleset the session ran under, so a replay or
  //     downstream analysis can reconstruct scoring + zone geometry exactly.
  section("CONFIG_CONSTANTS");
  out.push(csvRow(["key", "value", "unit"]));
  for (const [k, v, u] of [
    ["score_pts_per_kg_ice", SCORE_PTS_PER_KG, "pts/kg"],
    ["score_pts_per_asset_pt", SCORE_PTS_PER_AP, "pts/ap"],
    ["score_penalty_per_violation", SCORE_PENALTY_VIO, "pts"],
    ["score_carry_fraction", SCORE_CARRY_FRACTION, "fraction"],
    ["days_per_round", DAYS_PER_ROUND, "days"],
    ["px_per_km", PIXELS_PER_KM, "px/km"],
    ["km_per_px", KM, "km/px"],
    ["comsat_relay_radius_km", kmOf(COMSAT_RELAY_RADIUS), "km"],
    // v190: uniform DLA safety zone (every asset). Canonical km + on-map render km.
    ["zone_core_km", ZONE_KM.core, "km"],
    ["zone_harmonization_km", ZONE_KM.harmonization, "km"],
    ["zone_coordination_km", ZONE_KM.coordination, "km"],
    ["zone_display_scale", ZONE_DISPLAY_SCALE, "x"],
    ["zone_core_render_km", kmOf(ZONE_RADII_PX.core), "km"],
    ["zone_harmonization_render_km", kmOf(ZONE_RADII_PX.harmonization), "km"],
    ["zone_coordination_render_km", kmOf(ZONE_RADII_PX.coordination), "km"],
  ]) out.push(csvRow([k, v, u]));
  for (const t of (ZONE_TIERS || [])) out.push(csvRow([`zone_tier_mult.${t.key}`, t.mult, "xcore"]));
  // SAFETY_RADIUS now sizes only FUNCTIONAL footprints (power reach / pad apron /
  // deposit hub), not the keep-out ring, reported here as such.
  for (const type of ["solar", "habitat", "pad", "rover", "reactor"]) {
    if (SAFETY_RADIUS[type] != null) out.push(csvRow([`functional_reach.${type}`, kmOf(SAFETY_RADIUS[type]), "km"]));
  }

  // 2) INITIAL_CONDITIONS ──────────────────────────────────────────────────
  section("INITIAL_CONDITIONS");
  out.push(csvRow(["key", "value"]));
  const baseOf = (p) => {
    if (!p) return "";
    const b = p.base || (p.habitats && p.habitats[0]) || { x: p.x, y: p.y };
    return b && b.x != null ? `${Math.round(b.x)},${Math.round(b.y)}` : "";
  };
  for (const kv of [
    ["map_width_px", W], ["map_height_px", H], ["km_per_px", KM], ["px_per_km", PIXELS_PER_KM],
    ["totalRounds", totalRounds ?? ""], ["scenarioPreset", scenarioPreset ?? ""],
    ["claimRadius_actorI_px", claimR?.[0] ?? ""], ["claimRadius_actorII_px", claimR?.[1] ?? ""],
    ["actorI_base_px", baseOf(p1)], ["actorII_base_px", baseOf(p2)], ["actorIII_base_px", baseOf(p3)],
    ["actorI_stakeholder", p1?.stakeholderName || ""], ["actorII_stakeholder", p2?.stakeholderName || ""],
  ]) out.push(csvRow(kv));
  // Physics overrides (facilitator tuning), each as its own row so a replay can
  // restore the exact ruleset the game was played under.
  const po = physOverrides || {};
  for (const k of Object.keys(po)) out.push(csvRow([`phys.${k}`, po[k]]));

  // 3) CRATERS (static reference) ────────────────────────────────────────────
  section("CRATERS");
  out.push(csvRow(["crater_idx", "name", "cx_px", "cy_px", "cx_km", "cy_km", "quality", "size_px"]));
  (CRATER_DATA || []).forEach((c, i) => {
    out.push(csvRow([i, craterName(i) || "", Math.round(c.cx), Math.round(c.cy),
      kmOf(c.cx), kmOf(c.cy), c.quality == null ? "" : Number(c.quality).toFixed(2), c.size ?? ""]));
  });

  // 4) ACTORS ────────────────────────────────────────────────────────────────
  let advisories = { a1: 0, a2: 0 };
  try { advisories = coordinationIntrusions(p1, p2, {}); } catch { /* ignore */ }
  section("ACTORS");
  const actorCols = ["actor", "stakeholder", "active", "score",
    "score_banked", "score_carried", "score_infrastructure", "score_policy", "score_penalty",
    "iceDeposited_kg", "iceCarried_kg", "budget_cr", "econ_E", "rdAccum", "milStock",
    "assetPts", "safetyViolations", "coordAdvisories", "stance", "zoneScale", "safetyMult",
    "easementsGranted", "treatyFloor", "panels", "reactors", "habitats", "rovers", "pads", "comsats",
    "roverX_px", "roverY_px"];
  out.push(csvRow(actorCols));
  const actorRow = (p, label, adv) => {
    if (!p) { out.push(csvRow([label, "", "false"])); return; }
    const snap = actorMetricSnapshot(p);
    out.push(csvRow([
      label, snap.stakeholder, p.active === false ? "false" : "true", snap.score,
      snap.score_banked, snap.score_carried, snap.score_infrastructure, snap.score_policy, snap.score_penalty,
      snap.iceDeposited_kg, snap.iceCarried_kg, snap.budget_cr, snap.econ_E, snap.rdAccum, snap.milStock,
      snap.assetPts, snap.safetyViolations, adv, snap.stance, snap.zoneScale, p.safetyMult ?? 1,
      snap.easementsGranted, snap.treatyFloor, snap.panels, snap.reactors, snap.habitats, snap.rovers,
      snap.pads, snap.comsats, p.x ?? "", p.y ?? "",
    ]));
  };
  const advOf = { ACTOR_I: advisories.a1, ACTOR_II: advisories.a2, ACTOR_III: 0 };
  for (const [label, pp] of ACTORS) actorRow(pp, label, advOf[label] ?? 0);

  // 4b) SCORE_TERMS, long-format score decomposition (one row per term per
  //     actor), so the exact make-up of each score is reconstructable: term
  //     value in points plus its human-readable detail string.
  section("SCORE_TERMS");
  out.push(csvRow(["actor", "term_key", "term_label", "value_pts", "detail"]));
  for (const [label, pp] of ACTORS) {
    if (!pp) continue;
    const bd = scoreBreakdown(pp);
    for (const t of bd.terms) {
      out.push(csvRow([label, t.key, t.label, Math.round(t.value), t.detail || ""]));
    }
    out.push(csvRow([label, "TOTAL", "Total score", Math.round(bd.total), ""]));
  }

  // 5) ASSETS (with placement timing + declared safety radius) ───────────────
  section("ASSETS");
  out.push(csvRow(["actor", "type", "index", "x_px", "y_px", "x_km", "y_km", "health",
    "seq", "placed_round", "placed_day", "safety_radius_km", "declared_radius_km", "destroyed"]));
  const emitAssets = (p, label) => {
    if (!p) return;
    const sh = p.structureHealth || {};
    const mult = (Number.isFinite(p.safetyMult) && p.safetyMult > 0 ? p.safetyMult : 1)
               * (Number.isFinite(p.zoneScale) && p.zoneScale > 0 ? p.zoneScale : 1);
    const push = (type, pt, idx, h) => {
      if (!pt || pt.x == null) return;
      const hh = h == null ? 1 : h;
      const baseR = ZONE_RADII_PX.core; // v190: uniform DLA Core keep-out
      const place = placedAt.get(`${type}@${Math.round(pt.x)},${Math.round(pt.y)}`) || {};
      out.push(csvRow([label, type, idx, Math.round(pt.x), Math.round(pt.y),
        kmOf(pt.x), kmOf(pt.y), Number(hh).toFixed(3), pt.seq ?? place.seq ?? "",
        place.round ?? "", place.day ?? "",
        baseR ? kmOf(baseR) : "", baseR ? kmOf(baseR * mult) : "",
        hh <= 0.1 ? "true" : "false"]));
    };
    (p.panels || []).forEach((s, i) => push("solar", s, i, sh.panels?.[i]));
    (p.reactors || []).forEach((s, i) => push("reactor", s, i, sh.reactors?.[i]));
    (p.habitats || []).forEach((s, i) => push("habitat", s, i, sh.habitats?.[i]));
    (p.landingPads || []).forEach((s, i) => push("pad", s, i, sh.landingPads?.[i]));
    (p.comsats || []).forEach((s, i) => push("comsat", s, i, 1));
    if (p.x != null) push("rover", { x: p.x, y: p.y, seq: p.foundingSeq }, 0, 1);
    (p.extraRovers || []).forEach((er, i) => push("rover", er, i + 1, sh.extraRovers?.[i]));
  };
  emitAssets(p1, "ACTOR_I");
  for (const [label, pp] of ACTORS) emitAssets(pp, label);
  // 5b) ZONE_FRAMEWORK, Christine Tiballi 3-ring tier definitions.
  //     Source: Lunar Operations Field Guide: Lunar Designated Areas (2025).
  section("ZONE_FRAMEWORK_TIERS");
  out.push(csvRow(["tier_key", "tier_label", "radius_mult", "color", "access_rule"]));
  const TIER_RULES = {
    core: "operator only; breach scores a violation",
    harmonization: "cross only with prior coordination / notification",
    coordination: "overlap possible if it does not affect core ops",
  };
  (ZONE_TIERS || []).forEach((t) => out.push(csvRow([t.key, t.label, t.mult, t.color, TIER_RULES[t.key] || ""])));
  out.push(csvRow(["zone_core_render_km", kmOf(ZONE_RADII_PX.core)]));
  out.push(csvRow(["zone_harmonization_render_km", kmOf(ZONE_RADII_PX.harmonization)]));
  out.push(csvRow(["zone_coordination_render_km", kmOf(ZONE_RADII_PX.coordination)]));

  // 5b-ii) CHRISTINE_FRAMEWORK, the authoritative Field-Guide sizing + the
  //   player-adjustment rules in one table. `canonical_km` is Christine's real
  //   FSP zone size (0.1 / 0.5 / 1 km); `map_render_km` is what's drawn/scored
  //   on the 606 km play map (canonical x ZONE_DISPLAY_SCALE, so sub-km zones
  //   stay legible). v190: these apply UNIFORMLY to every asset, not just the
  //   reactor. `scale_min/max` are the bounds a player may resize each of their
  //   own rings to; `overreach_weight` is how hard expanding that tier past
  //   baseline is penalized (inner rings cost most).
  section("CHRISTINE_FRAMEWORK");
  out.push(csvRow(["tier", "field_guide_area", "canonical_ratio", "canonical_km",
    "map_render_km", "scale_min", "scale_max", "overreach_weight"]));
  const FG_AREA = { core: "Exclusion", harmonization: "EMI Caution", coordination: "Plume Reach" };
  const CANON = ZONE_KM, RENDER = { core: ZONE_RADII_PX.core, harmonization: ZONE_RADII_PX.harmonization, coordination: ZONE_RADII_PX.coordination };
  (TIER_KEYS || ["core", "harmonization", "coordination"]).forEach((k) => {
    const mult = (ZONE_TIERS.find((t) => t.key === k) || {}).mult ?? "";
    out.push(csvRow([k, FG_AREA[k] || "", mult, CANON[k], kmOf(RENDER[k]),
      TIER_SCALE_BOUNDS.min, TIER_SCALE_BOUNDS.max, TIER_OVERREACH_WEIGHT[k]]));
  });
  out.push(csvRow(["zone_display_scale", "", ZONE_DISPLAY_SCALE, "", "", "", "", ""]));

  // 5c) ZONE_RINGS_BY_ASSET, every tier radius (declared + baseline) for every
  //     zone-projecting asset, in km. Full geometric reconstruction of the
  //     3-ring footprint each actor declared.
  section("ZONE_RINGS_BY_ASSET");
  out.push(csvRow(["actor", "type", "index", "x_km", "y_km", "owner_mult",
    "core_km", "harmonization_km", "coordination_km",
    "core_base_km", "harmonization_base_km", "coordination_base_km"]));
  const emitRings = (p, label) => {
    if (!p) return;
    const ts = effectiveTierScales(p); // v186: independent per-tier scales
    // v190: every asset (reactor included) uses the SAME uniform DLA rings.
    const cB = ZONE_RADII_PX.core, hB = ZONE_RADII_PX.harmonization, dB = ZONE_RADII_PX.coordination;
    const row = (type, pt, idx) => {
      if (!pt || pt.x == null) return;
      out.push(csvRow([label, type, idx, kmOf(pt.x), kmOf(pt.y),
        `${ts.core.toFixed(2)}/${ts.harmonization.toFixed(2)}/${ts.coordination.toFixed(2)}`,
        kmOf(cB * ts.core), kmOf(hB * ts.harmonization), kmOf(dB * ts.coordination),
        kmOf(cB), kmOf(hB), kmOf(dB)]));
    };
    (p.panels || []).forEach((s, i) => row("solar", s, i));
    (p.reactors || []).forEach((s, i) => row("reactor", s, i));
    (p.habitats || []).forEach((s, i) => row("habitat", s, i));
    (p.landingPads || []).forEach((s, i) => row("pad", s, i));
    if (p.x != null) row("rover", { x: p.x, y: p.y }, 0);
    (p.extraRovers || []).forEach((er, i) => row("rover", er, i + 1));
  };
  for (const [label, pp] of ACTORS) emitRings(pp, label);

  // 5d) ZONE_OVERREACH, expansion beyond baseline and its scoring cost.
  //     v186: now reports each tier's effective scale (core/harmonization/
  //     coordination); overreach is inner-weighted, so the per-tier detail
  //     explains where the penalty comes from.
  section("ZONE_OVERREACH");
  out.push(csvRow(["actor", "core_scale", "harmonization_scale", "coordination_scale",
    "legacy_zoneScale", "safetyMult", "overreach_weighted", "zone_assets", "overreach_penalty"]));
  for (const [label, pp] of ACTORS) {
    if (!pp) { out.push(csvRow([label, "", "", "", "", "", "", "", ""])); continue; }
    const ts = effectiveTierScales(pp);
    out.push(csvRow([label,
      ts.core.toFixed(3), ts.harmonization.toFixed(3), ts.coordination.toFixed(3),
      pp.zoneScale ?? 1, pp.safetyMult ?? 1,
      zoneOverreach(pp).toFixed(3), zoneAssetCount(pp), Math.round(overreachPenalty(pp))]));
  }

  // 5e) ZONE_INTERACTIONS, pairwise geometry between every owner zone-asset and
  //     every opponent asset. For each pair: centre separation and which of the
  //     owner's three tiers (core / harmonization / coordination) the opponent
  //     asset centre falls inside (the finest tier the geometry implies). This is
  //     the full interaction matrix behind the safety-zone scoring.
  section("ZONE_INTERACTIONS");
  out.push(csvRow(["owner", "owner_type", "owner_idx", "owner_x_km", "owner_y_km",
    "vs_actor", "vs_type", "vs_idx", "vs_x_km", "vs_y_km",
    "separation_km", "core_km", "harmonization_km", "coordination_km", "innermost_tier"]));
  const zoneAssetsOf = (p) => {
    if (!p) return [];
    const acc = [];
    const ts = effectiveTierScales(p); // v186: per-tier scales
    const add = (type, pt, idx) => {
      if (!pt || pt.x == null) return;
      // v190: uniform DLA rings for every asset (reactor included).
      const core  = ZONE_RADII_PX.core          * ts.core;
      const harm  = ZONE_RADII_PX.harmonization * ts.harmonization;
      const coord = ZONE_RADII_PX.coordination  * ts.coordination;
      acc.push({ type, idx, x: pt.x, y: pt.y, core, harm, coord });
    };
    (p.panels || []).forEach((s, i) => add("solar", s, i));
    (p.reactors || []).forEach((s, i) => add("reactor", s, i));
    (p.habitats || []).forEach((s, i) => add("habitat", s, i));
    (p.landingPads || []).forEach((s, i) => add("pad", s, i));
    if (p.x != null) add("rover", { x: p.x, y: p.y }, 0);
    (p.extraRovers || []).forEach((er, i) => add("rover", er, i + 1));
    return acc;
  };
  const allAssetsOf = (p) => {
    if (!p) return [];
    const acc = [];
    const add = (type, pt, idx) => { if (pt && pt.x != null) acc.push({ type, idx, x: pt.x, y: pt.y }); };
    (p.panels || []).forEach((s, i) => add("solar", s, i));
    (p.reactors || []).forEach((s, i) => add("reactor", s, i));
    (p.habitats || []).forEach((s, i) => add("habitat", s, i));
    (p.landingPads || []).forEach((s, i) => add("pad", s, i));
    (p.comsats || []).forEach((s, i) => add("comsat", s, i));
    if (p.x != null) add("rover", { x: p.x, y: p.y }, 0);
    (p.extraRovers || []).forEach((er, i) => add("rover", er, i + 1));
    return acc;
  };
  // v192: all ORDERED actor pairs (owner vs every other present actor), so a
  // 3-actor session records I↔II, I↔III, II↔III interactions in both directions.
  const ORDERED_PAIRS = [];
  for (const [ol, op] of ACTORS) for (const [vl, vp] of ACTORS) if (ol !== vl) ORDERED_PAIRS.push([ol, op, vl, vp]);
  for (const [ownerLabel, owner, vsLabel, vs] of ORDERED_PAIRS) {
    const zones = zoneAssetsOf(owner);
    const others = allAssetsOf(vs);
    for (const z of zones) {
      for (const o of others) {
        const dpx = Math.hypot(o.x - z.x, o.y - z.y);
        const tier = dpx < z.core ? "core" : dpx < z.harm ? "harmonization" : dpx < z.coord ? "coordination" : "outside";
        out.push(csvRow([ownerLabel, z.type, z.idx, kmOf(z.x), kmOf(z.y),
          vsLabel, o.type, o.idx, kmOf(o.x), kmOf(o.y),
          (dpx * KM).toFixed(2), kmOf(z.core), kmOf(z.harm), kmOf(z.coord), tier]));
      }
    }
  }

  // v192) SAFETY_VIOLATION_ATTRIBUTION, the current-state N-actor breach tally.
  // For every ordered pair (owner, breacher), how many of the owner's Core zones
  // a breacher rover is sitting inside, charged to whichever arrived SECOND (the
  // first-mover is innocent) and skipping any easement the owner granted. `total`
  // is that actor's charged violations across all opponents this instant, the
  // exact quantity the score penalty is computed from. This makes first-mover /
  // arrival-delay experiments directly measurable from the export.
  section("SAFETY_VIOLATION_ATTRIBUTION");
  out.push(csvRow(["actor", "charged_violations_now", "cumulative_violations"]));
  {
    const playersInOrder = ACTORS.map(([, p]) => p);
    let vNow = [];
    try { vNow = attributeSafetyViolationsN(playersInOrder, { sharedGridActive: powerGridState?.mode === "shared" }); }
    catch { vNow = playersInOrder.map(() => ""); }
    ACTORS.forEach(([label, pp], i) => {
      out.push(csvRow([label, vNow[i] ?? "", pp?.safetyViolations ?? 0]));
    });
  }

  // DIPLOMACY_STATE, each actor's negotiated posture + economic dials, so the
  // full diplomatic configuration is reconstructable from the export alone.
  section("DIPLOMACY_STATE");
  out.push(csvRow(["actor", "stakeholder", "alloc_preset", "treaty_floor",
    "tier_core", "tier_harmonization", "tier_coordination",
    "budget_cr", "ice_kg", "asset_pts", "violations"]));
  for (const [label, pp] of ACTORS) {
    if (!pp) continue;
    const ts = pp.tierScale || {};
    out.push(csvRow([label, pp.stakeholderName ?? "", pp.allocPreset ?? "",
      pp.treatyFloor ?? "",
      (ts.core ?? 1), (ts.harmonization ?? 1), (ts.coordination ?? 1),
      Math.round(pp.budget ?? 0), Math.round(pp.iceDeposited ?? 0),
      pp.assetPts ?? 0, pp.safetyViolations ?? 0]));
  }

  // GRID_STATE, power + comms grid coupling (independent / offered / shared),
  // which drives the generator-zone exemptions in the safety scoring.
  section("GRID_STATE");
  out.push(csvRow(["grid", "mode", "offered_by", "offered_to", "shared"]));
  const gridRow = (name, g) => out.push(csvRow([name, g?.mode ?? "independent",
    g?.offeredBy ?? "", g?.offeredTo ?? "", (g?.mode === "shared") ? "yes" : "no"]));
  gridRow("power", powerGridState);
  gridRow("comms", commsGridState);

  // 6) METRICS_BY_ROUND (longitudinal flat series) ───────────────────────────
  section("METRICS_BY_ROUND");
  out.push(buildDetailedCsv({
    history, p1, p2, round, day, globalDay, simMode,
    scenarioPreset, version, powerGridState, commsGridState,
  }));

  // 7) ROVER_TRACE ───────────────────────────────────────────────────────────
  // Per-DAY when a tick trace is present (frame-by-frame), else per-round from
  // history. Rover strings are "x,y,ice[,power,status];...", the extra fields
  // are only present in the per-day trace.
  const haveTicks = Array.isArray(tickTrace) && tickTrace.length > 0;
  section("ROVER_TRACE");
  out.push(csvRow(["globalDay", "round", "day", "actor", "rover_idx",
    "x_px", "y_px", "x_km", "y_km", "ice_kg", "power", "status"]));
  const emitTrace = (gday, rnd, dy, label, traceStr) => {
    if (!traceStr) return;
    traceStr.split(";").forEach((rec, i) => {
      const f = rec.split(",");
      if (f[0] == null || f[0] === "") return;
      out.push(csvRow([gday, rnd, dy, label, i, f[0], f[1],
        kmOf(Number(f[0])), kmOf(Number(f[1])), f[2] ?? "", f[3] ?? "", f[4] ?? ""]));
    });
  };
  if (haveTicks) {
    for (const t of tickTrace) {
      emitTrace(t.globalDay, t.round, t.day, "ACTOR_I", t.rovers1);
      emitTrace(t.globalDay, t.round, t.day, "ACTOR_II", t.rovers2);
      if (t.rovers3) emitTrace(t.globalDay, t.round, t.day, "ACTOR_III", t.rovers3);
    }
  } else {
    for (const h of (history || [])) {
      emitTrace("", h.r, "", "ACTOR_I", h.rovers1);
      emitTrace("", h.r, "", "ACTOR_II", h.rovers2);
      if (h.rovers3) emitTrace("", h.r, "", "ACTOR_III", h.rovers3);
    }
  }

  // 8) CRATER_STATE ──────────────────────────────────────────────────────────
  // Per-DAY when a tick trace is present, else per-round from history.
  section("CRATER_STATE");
  out.push(csvRow(["globalDay", "round", "day", "crater_idx", "health"]));
  if (haveTicks) {
    for (const t of tickTrace) {
      if (!t.craterH) continue;
      t.craterH.split("|").forEach((hv, ci) => out.push(csvRow([t.globalDay, t.round, t.day, ci, hv])));
    }
  } else {
    for (const h of (history || [])) {
      if (!h.craterH) continue;
      h.craterH.split("|").forEach((hv, ci) => out.push(csvRow(["", h.r, "", ci, hv])));
    }
  }

  // 9) EVENT_LOG (complete structured action trace) ──────────────────────────
  section("EVENT_LOG");
  out.push(buildMissionLogCsv(missionLog));

  return out.join("\n");
}
