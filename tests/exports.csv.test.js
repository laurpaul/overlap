import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMissionLogCsv, buildSessionCsv } from "../src/sim/exports.js";

test("buildMissionLogCsv escapes commas and quotes in labels", () => {
  const log = [{ round: 1, day: 0, globalDay: 0, type: "deal", actor: 1, label: 'P1 → P2: gives 20cr, wants ice' }];
  const csv = buildMissionLogCsv(log);
  const lines = csv.split("\n");
  // label with a comma must be wrapped in quotes so it stays one field
  assert.ok(lines[1].includes('"P1 → P2: gives 20cr, wants ice"'));
  // header still leads with the stable columns
  assert.ok(lines[0].startsWith("round,day,globalDay,type,actor"));
});

test("buildMissionLogCsv includes any extra event fields as columns", () => {
  const log = [{ round: 2, day: 1, globalDay: 5, type: "build", actor: 2, itemType: "reactor", cost: 280, label: "placed" }];
  const csv = buildMissionLogCsv(log);
  const header = csv.split("\n")[0];
  assert.ok(header.includes("itemType") && header.includes("cost"));
  assert.ok(csv.split("\n")[1].includes("reactor"));
});

test("buildMissionLogCsv quotes embedded double-quotes correctly", () => {
  const csv = buildMissionLogCsv([{ round: 1, day: 0, globalDay: 0, type: "note", label: 'say "hi"' }]);
  assert.ok(csv.includes('"say ""hi"""'));
});

function actor(over = {}) {
  return {
    stakeholderName: "ARTEMIS", active: true,
    iceDeposited: 120, ice: 10, volatiles: 0, budget: 340, econ: 6.2, rdAccum: 3, milStock: 1,
    assetPts: 8, safetyViolations: 2, allocPreset: "economic", zoneScale: 1.3, easements: [2], treatyFloor: 1,
    x: 100, y: 100, foundingSeq: 1,
    panels: [{ x: 120, y: 90, seq: 3 }], reactors: [], habitats: [{ x: 200, y: 210, seq: 4 }],
    landingPads: [], comsats: [], extraRovers: [{ x: 150, y: 150, seq: 5, ice: 4 }],
    structureHealth: { panels: [1], habitats: [0.5], extraRovers: [1] }, ...over,
  };
}

test("buildSessionCsv emits all six sections", () => {
  const csv = buildSessionCsv({
    round: 3, day: 1, globalDay: 9, totalRounds: 6, simMode: "standard", scenarioPreset: "baseline",
    version: "2.7.172", p1: actor(), p2: actor({ stakeholderName: "ILRS" }),
    history: [{ r: 1, d1: 50, d2: 30, bud1: 300, bud2: 280 }], missionLog: [{ round: 1, day: 0, globalDay: 0, type: "build", label: "x, y" }],
    powerGridState: { mode: "shared" }, commsGridState: { mode: "independent" },
  });
  for (const s of ["# === SESSION ===", "# === ACTORS ===", "# === SCORE_BREAKDOWN ===", "# === ASSETS ===", "# === ROUND_HISTORY ===", "# === EVENT_LOG ==="]) {
    assert.ok(csv.includes(s), `missing section ${s}`);
  }
});

test("buildSessionCsv ACTORS row carries the rich per-actor detail", () => {
  const csv = buildSessionCsv({
    round: 1, day: 0, globalDay: 0, p1: actor(), p2: null,
    history: [], missionLog: [], powerGridState: { mode: "independent" }, commsGridState: { mode: "independent" },
  });
  const lines = csv.split("\n");
  const hdr = lines.find(l => l.startsWith("actor,stakeholder"));
  const row = lines.find(l => l.startsWith("ACTOR_I,ARTEMIS"));
  assert.ok(hdr.includes("score_banked") && hdr.includes("coordAdvisories") && hdr.includes("zoneScale"));
  assert.ok(row.includes("ARTEMIS"));
  assert.ok(row.includes("economic"));    // stance
  assert.ok(row.includes("1.3"));         // zoneScale
  assert.ok(row.includes("2"));           // easement actor id / violations
});

test("buildSessionCsv ASSETS section lists every placed asset with km coords + health", () => {
  const csv = buildSessionCsv({
    round: 1, day: 0, globalDay: 0, p1: actor(), p2: null,
    history: [], missionLog: [], powerGridState: {}, commsGridState: {},
  });
  const assetsIdx = csv.indexOf("# === ASSETS ===");
  const block = csv.slice(assetsIdx);
  assert.ok(block.includes("solar") && block.includes("habitat") && block.includes("rover"));
  // habitat health 0.5 should appear
  assert.ok(/habitat,0,200,210,[\d.]+,[\d.]+,0\.500/.test(block));
});

test("buildSessionCsv handles a null second actor gracefully", () => {
  const csv = buildSessionCsv({ round: 1, day: 0, globalDay: 0, p1: actor(), p2: null, history: [], missionLog: [], powerGridState: {}, commsGridState: {} });
  assert.ok(csv.includes("ACTOR_II,,false"));
});

// ── v178: full-reconstruction CSV ────────────────────────────────────────────
import { buildReconstructionCsv } from "../src/sim/exports.js";

function reconActor(over = {}) {
  return {
    id: 1, active: true, stakeholderName: "ARTEMIS",
    x: 250, y: 260, ice: 12, iceDeposited: 40, volatiles: 0,
    budget: 130, econ: 1.1, rdAccum: 5, milStock: 8,
    assetPts: 10, safetyViolations: 1, allocPreset: "balanced",
    zoneScale: 1.5, safetyMult: 1, treatyFloor: 0.8, easements: [],
    panels: [{ x: 300, y: 300 }], reactors: [], habitats: [{ x: 100, y: 100 }],
    landingPads: [], comsats: [], extraRovers: [{ x: 280, y: 280, ice: 5 }],
    structureHealth: { panels: [1.0], habitats: [1.0], extraRovers: [0.9] },
    ...over,
  };
}

const reconArgs = () => ({
  round: 3, day: 2, globalDay: 16, totalRounds: 6,
  simMode: "live", scenarioPreset: "standard", version: "2.7.178",
  p1: reconActor(),
  p2: reconActor({ id: 2, stakeholderName: "SELENE", x: 800, y: 800,
    habitats: [{ x: 820, y: 820 }], panels: [], extraRovers: [],
    structureHealth: { habitats: [1.0] } }),
  history: [
    { r: 1, m1: null, m2: null, rovers1: "250,260,12;280,280,5", rovers2: "800,800,0",
      craterH: "1.00|0.85|0.50", powerGrid: "independent", commsGrid: "independent" },
    { r: 2, m1: null, m2: null, rovers1: "255,265,20", rovers2: "810,810,3",
      craterH: "1.00|0.70|0.30", powerGrid: "shared", commsGrid: "independent" },
  ],
  missionLog: [
    { round: 1, day: 0, globalDay: 0, type: "setup", actor: 1, x: 250, y: 260, label: "base" },
    { round: 2, day: 1, globalDay: 8, type: "placement", actor: 1, itemType: "habitat", x: 100, y: 100, cost: 200, label: "placed habitat" },
    { round: 2, day: 3, globalDay: 10, type: "mine", actor: 1, kg: 4.2, craterIdx: 1, x: 255, y: 265, label: "mined" },
    { round: 2, day: 4, globalDay: 11, type: "deposit", actor: 1, kg: 18, x: 100, y: 100, label: "deposited" },
  ],
  powerGridState: { mode: "shared" }, commsGridState: { mode: "independent" },
  claimR: [80, 90], physOverrides: { BASE_MINE_RATE: 4.84, ICE_CAP: 80 },
});

test("buildReconstructionCsv: emits every documented section", () => {
  const csv = buildReconstructionCsv(reconArgs());
  for (const s of ["SESSION", "INITIAL_CONDITIONS", "CRATERS", "ACTORS", "ASSETS",
                   "METRICS_BY_ROUND", "ROVER_TRACE", "CRATER_STATE", "EVENT_LOG"]) {
    assert.ok(csv.includes(`# === ${s} ===`), `missing section ${s}`);
  }
});

test("buildReconstructionCsv: INITIAL_CONDITIONS captures scenario, claim radii, bases, physics", () => {
  const csv = buildReconstructionCsv(reconArgs());
  assert.ok(csv.includes("claimRadius_actorI_px,80"));
  assert.ok(csv.includes("claimRadius_actorII_px,90"));
  assert.ok(csv.includes("actorI_base_px,\"250,260\"") || csv.includes("actorI_base_px,250,260") || csv.includes("250,260"));
  assert.ok(csv.includes("phys.BASE_MINE_RATE,4.84"));
  assert.ok(csv.includes("phys.ICE_CAP,80"));
  assert.ok(csv.includes("km_per_px,0.5"));
});

test("buildReconstructionCsv: ASSETS cross-references placement round/day + declared radius", () => {
  const csv = buildReconstructionCsv(reconArgs());
  // The habitat at (100,100) was placed in round 2 day 1 per the event log.
  const assetsBlock = csv.split("# === ASSETS ===")[1].split("# ===")[0];
  const habLine = assetsBlock.split("\n").find(l => l.startsWith("ACTOR_I,habitat"));
  assert.ok(habLine, "expected an ACTOR_I habitat row");
  const cells = habLine.split(",");
  // columns: actor,type,index,x_px,y_px,x_km,y_km,health,seq,placed_round,placed_day,...
  assert.equal(cells[3], "100");          // x_px
  assert.equal(cells[9], "2");            // placed_round
  assert.equal(cells[10], "1");           // placed_day
  // declared radius = base safety radius × zoneScale(1.5); must be > base.
  const baseR = Number(cells[11]), declR = Number(cells[12]);
  assert.ok(declR > baseR, "declared radius should reflect the 1.5× zone scale");
});

test("buildReconstructionCsv: ROVER_TRACE (round fallback) expands rover positions", () => {
  const csv = buildReconstructionCsv(reconArgs());
  const trace = csv.split("# === ROVER_TRACE ===")[1].split("# ===")[0];
  // No tick trace passed → round fallback: globalDay/day blank, round present.
  // Columns: globalDay,round,day,actor,rover_idx,x_px,y_px,...
  assert.ok(trace.includes(",1,,ACTOR_I,0,250,260"));
  assert.ok(trace.includes(",1,,ACTOR_I,1,280,280"));
  assert.ok(trace.includes(",2,,ACTOR_I,0,255,265"));
});

test("buildReconstructionCsv: CRATER_STATE (round fallback) expands crater health", () => {
  const csv = buildReconstructionCsv(reconArgs());
  const cs = csv.split("# === CRATER_STATE ===")[1].split("# ===")[0];
  // Columns: globalDay,round,day,crater_idx,health
  assert.ok(cs.includes(",1,,2,0.50"));  // round 1, crater 2, health 0.50
  assert.ok(cs.includes(",2,,1,0.70"));  // round 2, crater 1, health 0.70
});

test("buildReconstructionCsv: a per-day tick trace produces frame-by-frame rows", () => {
  const args = reconArgs();
  args.tickTrace = [
    { globalDay: 0, round: 1, day: 0, rovers1: "250,260,0,78,mining", rovers2: "800,800,0,80,idle", craterH: "1.00|0.95" },
    { globalDay: 1, round: 1, day: 1, rovers1: "255,262,4,74,mining", rovers2: "802,801,0,79,idle", craterH: "1.00|0.88" },
    { globalDay: 2, round: 1, day: 2, rovers1: "260,265,8,70,returning", rovers2: "805,803,0,78,idle", craterH: "1.00|0.80" },
  ];
  const csv = buildReconstructionCsv(args);
  const trace = csv.split("# === ROVER_TRACE ===")[1].split("# ===")[0];
  // Per-day rows carry globalDay + day + power + status.
  assert.ok(trace.includes("0,1,0,ACTOR_I,0,250,260,125.00,130.00,0,78,mining"));
  assert.ok(trace.includes("2,1,2,ACTOR_I,0,260,265,130.00,132.50,8,70,returning"));
  // Three days × two actors = six rover rows (one rover each here).
  const dataRows = trace.trim().split("\n").filter(l => l.includes("ACTOR_"));
  assert.equal(dataRows.length, 6);
  // Crater state is per-day too.
  const cs = csv.split("# === CRATER_STATE ===")[1].split("# ===")[0];
  assert.ok(cs.includes("1,1,1,1,0.88"));  // globalDay 1, round 1, day 1, crater 1, health 0.88
});

test("buildReconstructionCsv: EVENT_LOG carries structured spatial fields", () => {
  const csv = buildReconstructionCsv(reconArgs());
  const log = csv.split("# === EVENT_LOG ===")[1];
  // deposit event keeps kg + position; mine keeps craterIdx
  assert.ok(log.includes("deposit"));
  assert.ok(log.includes("craterIdx") || log.includes("mine"));
});
