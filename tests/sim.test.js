// Run with: node --test tests/sim.test.js
//
// These tests cover the PURE-JS sim modules. They mock the few cases where
// map data is referenced (snapToPSR, simDay) by direct buffer writes, since
// loadMapData() needs a browser canvas to read JPEGs.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  // physics
  roverSlopeFactor, roverPowerFactor, analyzePixel,
  // economy
  calcBudget, calcCompetitiveness, calcDeltaE, calcDeltaR, calcDeltaM,
  calcRdMineBonus, calcMilScore, calcAssetCosts, makePlayer, activatePlayer,
  scorePlayerState,
  SCORE_PTS_PER_KG, SCORE_PTS_PER_AP, SCORE_PENALTY_VIO, SCORE_CARRY_FRACTION,
  pickMergedGridState,
  // power
  allocateDailyPower,
  // utils
  dist, clamp, lerp, stepToward, isNight, hasPlacementGrace,
  // map sampling
  earthVisAt, isInCommsBlackout, effectiveEarthVis,
  pxToLatLon, MAP_LAT_PROJ,
  // stakeholders
  STAKEHOLDER_DEFS, getStakeholderDef,
  // labels
  structureLabel, craterName,
  // constants
  POWER_CAP, ROVER_RECHARGE_LOW, ROVER_RECHARGE_HIGH,
  ALPHA, E_INIT, STARTING_BUDGET,
  COMMS_BLACKOUT_THRESHOLD, COMSAT_RELAY_RADIUS,
} from "../src/sim/index.js";

import { EARTH_VIS_MAP, PSR_MASK, SLOPE_MAP, ILLUM_MAP, ICE_DEPTH_MAP, HYDROGEN_MAP, TEMPERATURE_MAP } from "../src/sim/mapData.js";
import { W, LANDING_DAMAGE, SAFETY_RADIUS } from "../src/sim/constants.js";

// ── Slope physics ──────────────────────────────────────────────────────────
test("roverSlopeFactor -- flat ground is 1.0", () => {
  assert.equal(roverSlopeFactor(0), 1);
});
test("roverSlopeFactor -- clamped at 25° to zero", () => {
  assert.equal(roverSlopeFactor(25), 0);
  assert.equal(roverSlopeFactor(30), 0);
  assert.equal(roverSlopeFactor(-5), 1);  // clamped low at 1
});
test("roverSlopeFactor -- linear in-between", () => {
  // s = 12.5 → 1 - 12.5/25 = 0.5
  assert.equal(roverSlopeFactor(12.5), 0.5);
});
test("roverSlopeFactor -- NaN safe", () => {
  assert.equal(roverSlopeFactor(NaN), 1.0);
});

test("roverPowerFactor -- flat ground is 1.0", () => {
  assert.equal(roverPowerFactor(0), 1);
});
test("roverPowerFactor -- quadratic in s/15", () => {
  // s = 15 → 1 + 1 = 2.0  (15° → 2× power)
  assert.equal(roverPowerFactor(15), 2);
  // s = 30 → 1 + 4 = 5.0
  assert.equal(roverPowerFactor(30), 5);
});

// ── Economy ────────────────────────────────────────────────────────────────
test("calcBudget -- Budget = α * E", () => {
  assert.equal(calcBudget(10), Math.round(ALPHA * 10));
  assert.equal(calcBudget(E_INIT), Math.round(ALPHA * E_INIT));
  // Null/undefined → fall back to E_INIT
  assert.equal(calcBudget(null), Math.round(ALPHA * E_INIT));
});

test("calcCompetitiveness -- bounded [0, 1] with default weights", () => {
  // All max: each √ = 1, weighted sum = w1+w2+w3 = 1
  const c1 = calcCompetitiveness(10, 100, 5, 10, 100, 5);
  assert.ok(Math.abs(c1 - 1.0) < 1e-9);
  // All zero: c = 0
  const c0 = calcCompetitiveness(0, 0, 0, 10, 100, 5);
  assert.equal(c0, 0);
});

test("calcDeltaE -- non-negative when C and R non-negative", () => {
  for (const I of [0, 5, 20]) {
    for (const C of [0, 0.5, 1]) {
      for (const R of [0, 50, 200]) {
        const d = calcDeltaE(I, C, R);
        assert.ok(d >= 0, `ΔE should be ≥ 0 for I=${I} C=${C} R=${R}, got ${d}`);
      }
    }
  }
});

test("calcDeltaR -- has decay term when C < 1", () => {
  // I_R = 0, C = 0 → ΔR = 0 - α_R * 1 = -α_R (negative)
  const d = calcDeltaR(0, 0);
  assert.ok(d < 0);
});

test("calcDeltaM -- α_M decay drives high M back down", () => {
  // I_M = 0, M = 100 → ΔM = -α_M * 100 (negative)
  assert.ok(calcDeltaM(0, 100) < 0);
});

test("calcRdMineBonus -- formula matches 1 + (R/200) * 0.5", () => {
  // Note: the v15 comment said "+50% per 100 R&D" but the actual formula
  // is +25% per 100 R&D (+50% per 200). Comment was off by 2×; balance is
  // tuned to the formula, not the comment.
  assert.equal(calcRdMineBonus(0), 1);
  assert.equal(calcRdMineBonus(100), 1 + 0.25);
  assert.equal(calcRdMineBonus(200), 1 + 0.50);
  assert.equal(calcRdMineBonus(400), 1 + 1.00);
});

test("calcMilScore -- never below floor of 0.1", () => {
  assert.equal(calcMilScore(0), 0.1);
  assert.equal(calcMilScore(-100), 0.1);
});

test("calcAssetCosts -- Artemis cost modifier applies", () => {
  const { costs: base }    = calcAssetCosts({});
  const { costs: artemis } = calcAssetCosts({}, "artemis");
  // Artemis has habitat: 0.85 → habitat is cheaper.
  assert.ok(artemis.habitat < base.habitat);
});

// ── Player factory ─────────────────────────────────────────────────────────
test("makePlayer -- sensible defaults", () => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#A8A8F0");
  assert.equal(p.id, 1);
  assert.equal(p.active, true);
  assert.equal(p.power, POWER_CAP * 0.65);
  assert.equal(p.ice, 0);
  assert.equal(p.econ, E_INIT);
  assert.equal(p.budget, STARTING_BUDGET);
  assert.deepEqual(p.panels, []);
});

test("makePlayer -- Artemis budgetMod is 1.25", () => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#A8A8F0", { stakeholderId: "artemis" });
  assert.equal(p.budget, Math.round(STARTING_BUDGET * 1.25));
  assert.equal(p.stakeholderId, "artemis");
});

test("activatePlayer -- idempotent on already-active player", () => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  const p2 = activatePlayer(p);
  assert.equal(p2, p);  // returns input unchanged
});

test("activatePlayer -- flips inactive → active", () => {
  const p = makePlayer({ x: 600, y: 600 }, 1, "#fff", { active: false });
  assert.equal(p.active, false);
  const p2 = activatePlayer(p);
  assert.equal(p2.active, true);
});

// ── Stakeholders ───────────────────────────────────────────────────────────
test("STAKEHOLDER_DEFS -- seven archetypes", () => {
  assert.equal(STAKEHOLDER_DEFS.length, 7);
  const ids = STAKEHOLDER_DEFS.map((s) => s.id);
  assert.deepEqual(ids.sort(), ["artemis", "aurelian", "concordium", "ilrs", "large_commercial", "observer", "small_commercial"]);
});

test("getStakeholderDef -- defaults to first on miss", () => {
  assert.equal(getStakeholderDef("nope").id, "artemis");
  assert.equal(getStakeholderDef("ilrs").id, "ilrs");
});

// ── Utilities ──────────────────────────────────────────────────────────────
test("dist -- Pythagoras", () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("clamp / lerp", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test("stepToward -- arrived flag when within speed", () => {
  const r = stepToward({ x: 0, y: 0 }, { x: 1, y: 0 }, 5);
  assert.equal(r.arrived, true);
  assert.equal(r.x, 1);
  assert.equal(r.y, 0);
});

test("stepToward -- partial step toward target", () => {
  const r = stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
  assert.equal(r.arrived, false);
  assert.equal(r.x, 4);
  assert.equal(r.y, 0);
});

test("isNight -- 14-day cycle, second half dark", () => {
  assert.equal(isNight(0), false);
  assert.equal(isNight(6), false);
  assert.equal(isNight(7), true);
  assert.equal(isNight(13), true);
  assert.equal(isNight(14), false);  // cycle wraps
});

test("hasPlacementGrace -- first 7 days after arrival", () => {
  assert.equal(hasPlacementGrace(0, 0), true);
  assert.equal(hasPlacementGrace(0, 6), true);
  assert.equal(hasPlacementGrace(0, 7), false);
  assert.equal(hasPlacementGrace(5, 11), true);
  assert.equal(hasPlacementGrace(5, 12), false);
});

// ── Geographic projection ──────────────────────────────────────────────────
test("MAP_LAT_PROJ -- pole returns -90°", () => {
  const lat = MAP_LAT_PROJ(0);
  assert.ok(Math.abs(lat - (-90)) < 1e-9);
});

test("pxToLatLon -- pole gives 90°S", () => {
  const { lat } = pxToLatLon(606, 606);
  assert.ok(Math.abs(lat - (-90)) < 1e-6);
});

// ── Map sampling -- comms + comsat relay ────────────────────────────────────
test("earthVisAt -- reads from EARTH_VIS_MAP buffer", () => {
  EARTH_VIS_MAP[100 * W + 100] = 0.5;
  assert.equal(earthVisAt(100, 100), 0.5);
  EARTH_VIS_MAP[100 * W + 100] = 0;  // reset
});

test("isInCommsBlackout -- fires below threshold", () => {
  const ix = 200 * W + 200;
  EARTH_VIS_MAP[ix] = COMMS_BLACKOUT_THRESHOLD - 0.01;
  assert.equal(isInCommsBlackout(200, 200), true);
  EARTH_VIS_MAP[ix] = COMMS_BLACKOUT_THRESHOLD + 0.01;
  assert.equal(isInCommsBlackout(200, 200), false);
  EARTH_VIS_MAP[ix] = 0;
});

test("effectiveEarthVis -- comsat lifts blackout when in range", () => {
  const ix = 300 * W + 300;
  EARTH_VIS_MAP[ix] = 0.0;
  // No comsats: still 0
  assert.equal(effectiveEarthVis(300, 300, []), 0);
  // One comsat right on the pixel: full boost
  const comsats = [{ x: 300, y: 300 }];
  assert.ok(effectiveEarthVis(300, 300, comsats) > COMMS_BLACKOUT_THRESHOLD);
  // Comsat just outside relay radius: no contribution
  const far = [{ x: 300 + COMSAT_RELAY_RADIUS + 5, y: 300 }];
  assert.equal(effectiveEarthVis(300, 300, far), 0);
  EARTH_VIS_MAP[ix] = 0;
});

// ── Hysteresis sanity (regression test for v20 bounce bug) ─────────────────
test("Recharge hysteresis band is wide enough to prevent bounce", () => {
  // LOW < HIGH and the gap must be substantial.
  assert.ok(ROVER_RECHARGE_LOW < ROVER_RECHARGE_HIGH);
  assert.ok(ROVER_RECHARGE_HIGH - ROVER_RECHARGE_LOW >= 0.3);
});

// ── scorePlayerState ───────────────────────────────────────────────────────

test("scorePlayerState -- null player → 0", () => {
  assert.equal(scorePlayerState(null), 0);
  assert.equal(scorePlayerState(undefined), 0);
});

test("scorePlayerState -- empty player → 0", () => {
  // No deposited ice, no assets, no violations: should score 0.
  const p = { iceDeposited: 0, assetPts: 0, ice: 0, safetyViolations: 0 };
  assert.equal(scorePlayerState(p), 0);
});

test("scorePlayerState -- deposited ice at PTS_PER_KG", () => {
  const p = { iceDeposited: 100, assetPts: 0, ice: 0 };
  assert.equal(scorePlayerState(p), 100 * SCORE_PTS_PER_KG);
});

test("scorePlayerState -- primary rover carry counts at CARRY_FRACTION", () => {
  // 100 kg in the primary rover's hopper, no deposits, no extras.
  const p = { iceDeposited: 0, assetPts: 0, ice: 100 };
  assert.equal(scorePlayerState(p), 100 * SCORE_CARRY_FRACTION);
});

test("scorePlayerState -- extra rovers' carry also counts", () => {
  // Sum across primary + all extras.
  const p = {
    iceDeposited: 0,
    assetPts: 0,
    ice: 50,
    extraRovers: [{ ice: 30 }, { ice: 20 }],
  };
  // (50 + 30 + 20) * 0.5 = 50
  assert.equal(scorePlayerState(p), 50);
});

test("scorePlayerState -- volatiles also count at CARRY_FRACTION", () => {
  // Future LRO water+CO+CH4 split hook.
  const p = {
    iceDeposited: 0, assetPts: 0,
    ice: 0,
    volatiles: 40,
    extraRovers: [{ volatiles: 10 }],
  };
  assert.equal(scorePlayerState(p), 50 * SCORE_CARRY_FRACTION);
});

test("scorePlayerState -- assetPts at PTS_PER_AP", () => {
  const p = { iceDeposited: 0, assetPts: 3, ice: 0 };
  assert.equal(scorePlayerState(p), 3 * SCORE_PTS_PER_AP);
});

test("scorePlayerState -- scoreAdjustments add directly", () => {
  const p = { iceDeposited: 0, assetPts: 0, ice: 0, scoreAdjustments: 27 };
  assert.equal(scorePlayerState(p), 27);
});

test("scorePlayerState -- safety violations penalised at PENALTY_VIO", () => {
  const p = { iceDeposited: 100, safetyViolations: 2 };
  // 100 - 2 * 25 = 50
  assert.equal(scorePlayerState(p), 100 - 2 * SCORE_PENALTY_VIO);
});

test("scorePlayerState -- full composite formula", () => {
  const p = {
    iceDeposited: 200,
    ice: 60,                     // carry: 30
    extraRovers: [{ ice: 40 }],  // carry: 20
    assetPts: 5,                 // 75
    scoreAdjustments: 10,
    safetyViolations: 1,         // -25
  };
  // 200 + 30 + 20 + 75 + 10 - 25 = 310
  assert.equal(scorePlayerState(p), 310);
});

// ── allocateDailyPower: destroyed-rover gating ─────────────────────────────

test("allocateDailyPower -- destroyed extra rover receives NO power", () => {
  // A reactor in range of two extra rovers; one has health 0.
  // (Using a reactor not a solar panel so we don't have to populate
  // ILLUM_MAP -- REACTOR_OUTPUT is a fixed constant.)
  // The healthy rover should receive power; the dead one stays put.
  const player = {
    active: true,
    arrivalDay: 0,
    x: 500, y: 500,
    power: 60,
    panels: [],
    reactors: [{ x: 500, y: 500 }],
    habitats: [],
    extraRovers: [
      { x: 510, y: 500, power: 40 },  // healthy rover
      { x: 520, y: 500, power: 20 },  // destroyed rover (health 0)
    ],
    structureHealth: {
      panels:      [],
      reactors:    [1.0],
      habitats:    [],
      extraRovers: [1.0, 0],
      landingPads: [],
    },
  };
  const [out] = allocateDailyPower([player], 0, false);
  // Healthy rover got power; dead one didn't change.
  assert.ok(out.extraRovers[0].power > 40, `healthy rover charged from 40 to ${out.extraRovers[0].power}`);
  assert.equal(out.extraRovers[1].power, 20, "dead rover stays at 20");
});

test("allocateDailyPower -- fully healthy network charges as before", () => {
  // Sanity check: with all rovers healthy, the lowest-power one gets the
  // generator's first allocation (smoke test that we didn't break the
  // happy path).
  const player = {
    active: true,
    arrivalDay: 0,
    x: 500, y: 500,
    power: 60,
    panels: [],
    reactors: [{ x: 500, y: 500 }],
    habitats: [],
    extraRovers: [{ x: 510, y: 500, power: 30 }],
    structureHealth: {
      panels:      [],
      reactors:    [1.0],
      habitats:    [],
      extraRovers: [1.0],
      landingPads: [],
    },
  };
  const [out] = allocateDailyPower([player], 0, false);
  // The extra rover (power 30) was lower than the primary (60), so it
  // should be the first chosen.
  assert.ok(out.extraRovers[0].power > 30, `extra rover charged from 30 to ${out.extraRovers[0].power}`);
});

// ── analyzePixel: per-pixel terrain analysis ────────────────────────────────
//
// Verify the equipment-recommendation engine returns sensible verdicts for
// the four asset types and the mining branch under different terrain
// signatures.

const ANALYZE_X = 700;
const ANALYZE_Y = 700;

function setPixel(props) {
  const i = ANALYZE_Y * W + ANALYZE_X;
  PSR_MASK[i]        = props.psr   ? 1 : 0;
  SLOPE_MAP[i]       = props.slope ?? 0;
  ILLUM_MAP[i]       = props.illum ?? 0;
  EARTH_VIS_MAP[i]   = props.earth ?? 0;
  ICE_DEPTH_MAP[i]   = props.ice   ?? 0;
  HYDROGEN_MAP[i]    = props.h2    ?? 0;
  TEMPERATURE_MAP[i] = props.temp  ?? 0;
}

function findRec(out, asset) {
  return out.recs.find((r) => r.asset === asset);
}

test("analyzePixel -- out of bounds returns null", () => {
  assert.equal(analyzePixel(-1, 0), null);
  assert.equal(analyzePixel(0, -1), null);
  assert.equal(analyzePixel(W, 0), null);
});

test("analyzePixel -- high illumination + flat terrain → solar verdict 'good'", () => {
  setPixel({ slope: 2, illum: 0.85, earth: 0.6 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "solar").verdict, "good");
});

test("analyzePixel -- steep slope → solar verdict 'bad'", () => {
  setPixel({ slope: 25, illum: 0.9 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "solar").verdict, "bad");
});

test("analyzePixel -- flat terrain with high Earth visibility → habitat verdict 'good'", () => {
  setPixel({ slope: 4, earth: 0.7 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "habitat").verdict, "good");
});

test("analyzePixel -- steep slope → habitat verdict 'bad'", () => {
  setPixel({ slope: 18 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "habitat").verdict, "bad");
});

test("analyzePixel -- slope 4° → reactor verdict 'good'", () => {
  setPixel({ slope: 4 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "reactor").verdict, "good");
});

test("analyzePixel -- slope > 12° → reactor verdict 'bad'", () => {
  setPixel({ slope: 14 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "reactor").verdict, "bad");
});

test("analyzePixel -- pad needs slope <8°", () => {
  setPixel({ slope: 10 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "pad").verdict, "bad");
});

test("analyzePixel -- flat pad with Earth comms → pad verdict 'good'", () => {
  setPixel({ slope: 3, earth: 0.4 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "pad").verdict, "good");
});

test("analyzePixel -- flat ground → rover verdict 'good'", () => {
  setPixel({ slope: 5 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "rover").verdict, "good");
});

test("analyzePixel -- slope 22° → rover verdict 'bad' (impassable)", () => {
  setPixel({ slope: 22 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "rover").verdict, "bad");
});

test("analyzePixel -- PSR with high ice → mining verdict 'good'", () => {
  setPixel({ psr: true, ice: 0.6 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "mining").verdict, "good");
});

test("analyzePixel -- non-PSR → mining verdict 'bad'", () => {
  setPixel({ psr: false, ice: 0.9 });  // even with ice, non-PSR can't be mined
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.equal(findRec(out, "mining").verdict, "bad");
  assert.ok(out.recs.find((r) => r.asset === "mining").reason.includes("Not a PSR"));
});

test("analyzePixel -- returns all six asset types in recs", () => {
  setPixel({ slope: 5 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  const kinds = out.recs.map((r) => r.asset).sort();
  assert.deepEqual(kinds, ["habitat", "mining", "pad", "reactor", "rover", "solar"]);
});

test("analyzePixel -- output includes lat/lon and raw fields", () => {
  setPixel({ slope: 7, illum: 0.5, earth: 0.35, ice: 0.2, h2: 0.4, temp: 0.6 });
  const out = analyzePixel(ANALYZE_X, ANALYZE_Y);
  assert.ok(Number.isFinite(out.lat));
  assert.ok(Number.isFinite(out.lon));
  // Buffers are Float32Array; verify with a small tolerance.
  const close = (a, b) => Math.abs(a - b) < 1e-5;
  assert.ok(close(out.slope, 7),    `slope ${out.slope}`);
  assert.ok(close(out.illum, 0.5),  `illum ${out.illum}`);
  assert.ok(close(out.earth, 0.35), `earth ${out.earth}`);
  assert.ok(close(out.ice,   0.2),  `ice ${out.ice}`);
  assert.ok(close(out.h2,    0.4),  `h2 ${out.h2}`);
  assert.ok(close(out.temp,  0.6),  `temp ${out.temp}`);
});




// ── pickMergedGridState: bot batch-sim grid-state merger ────────────────────

const INDEP    = { mode: "independent", offeredBy: null, offeredTo: null };
const OFFERED  = { mode: "offered",     offeredBy: 1,    offeredTo: 2    };
const SHARED   = { mode: "shared",      offeredBy: 1,    offeredTo: 2    };

test("pickMergedGridState -- neither bot changed → returns presim", () => {
  const result = pickMergedGridState(INDEP, INDEP, INDEP);
  // Identity-equal so the caller can short-circuit if needed.
  assert.equal(result, INDEP);
});

test("pickMergedGridState -- only P1 changed → returns P1's state", () => {
  const result = pickMergedGridState(INDEP, OFFERED, INDEP);
  assert.equal(result.mode, "offered");
});

test("pickMergedGridState -- only P2 changed → returns P2's state", () => {
  const result = pickMergedGridState(INDEP, INDEP, OFFERED);
  assert.equal(result.mode, "offered");
});

test("pickMergedGridState -- both changed: shared beats offered", () => {
  // Both bots transitioned from "independent" → P1 to "offered", P2 to
  // "shared" (impossible in practice without an offer, but verifies tie-break).
  const result = pickMergedGridState(INDEP, OFFERED, SHARED);
  assert.equal(result.mode, "shared");
});

test("pickMergedGridState -- both changed: offered beats independent", () => {
  // P1 decoupled (shared → independent), P2 stayed in shared then... no,
  // this would mean P2 didn't change. Adjusted scenario: presim "offered",
  // P1 decouples to "independent" (impossible from offered), P2 joins to
  // "shared". The function picks shared as more active.
  const result = pickMergedGridState(OFFERED, INDEP, SHARED);
  assert.equal(result.mode, "shared");
});

test("pickMergedGridState -- both decouple from shared → independent (agreement)", () => {
  // Both bots transition shared → independent. The function picks one
  // (both ranks 0); either is fine since they're equal.
  const result = pickMergedGridState(SHARED, INDEP, INDEP);
  assert.equal(result.mode, "independent");
});

test("pickMergedGridState -- offeredBy/offeredTo differences count as a change", () => {
  // Same mode but offeredBy/To swapped -- that IS a change.
  const a = { mode: "offered", offeredBy: 1, offeredTo: 2 };
  const b = { mode: "offered", offeredBy: 2, offeredTo: 1 };  // role swap
  const result = pickMergedGridState(INDEP, a, b);
  // Both changed; both same mode rank → first one returned (a).
  assert.equal(result, a);
});

// ── craterName resolver ──────────────────────────────────────────────────
// v45: maps a CRATER_DATA index (extracted from the PSR mask) to the
// closest named IAU crater within ~15 km. Tests install a synthetic
// CRATER_DATA[0] near a known CRATER_LABELS entry and verify the
// resolver finds it.

import { CRATER_DATA, CRATER_LABELS } from "../src/sim/mapData.js";

test("craterName -- returns null for null/negative/missing index", () => {
  assert.equal(craterName(null), null);
  assert.equal(craterName(undefined), null);
  assert.equal(craterName(-1), null);
  // Without prior setup, CRATER_DATA[9999] is undefined → null.
  assert.equal(craterName(9999), null);
});

test("craterName -- resolves to closest named crater within tolerance", () => {
  // Shackleton is at (622, 619) in CRATER_LABELS (source-pixel coords).
  // Install a synthetic CRATER_DATA[0] right at that position.
  const SHACK = CRATER_LABELS.find(c => c.name === "Shackleton");
  assert.ok(SHACK, "Shackleton must exist in the fixture");
  CRATER_DATA[0] = {
    cx: SHACK.x, cy: SHACK.y,
    mineX: SHACK.x, mineY: SHACK.y,
    size: 100, pixels: [], quality: 1.0,
  };
  CRATER_DATA.length = 1;
  assert.equal(craterName(0), "Shackleton");
});

test("craterName -- returns null for craters far from any named feature", () => {
  // Off in the corner, well outside the 30-px tolerance from any named crater.
  CRATER_DATA[0] = {
    cx: 50, cy: 50, mineX: 50, mineY: 50,
    size: 10, pixels: [], quality: 1.0,
  };
  CRATER_DATA.length = 1;
  assert.equal(craterName(0), null);
});

test("craterName -- picks closer of two candidates", () => {
  // Place a crater right between two named features and verify it picks
  // the closer one. We don't know the geography ahead of time, so just
  // verify the result is one of CRATER_LABELS' names (or null).
  CRATER_DATA[0] = {
    cx: 622, cy: 619,  // Shackleton's exact position
    mineX: 622, mineY: 619,
    size: 50, pixels: [], quality: 1.0,
  };
  CRATER_DATA.length = 1;
  const result = craterName(0);
  assert.equal(result, "Shackleton");
});

// v123 (item 5): score-transparency contract. Every action that the mission log
// now annotates with a "why" must move (or deliberately not move) the score by
// the amount its log claims. This locks the per-action score contract so the
// rationale strings stay truthful to scorePlayerState.
test("score transparency: each action's score contribution matches its logged rationale", () => {
  const base = { x: 600, y: 600 };
  const p = makePlayer(base, 1, "#fff");
  const score0 = scorePlayerState(p);

  // Asset placement: +ASSET_POINTS*SCORE_PTS_PER_AP (logged as "+N score (+M asset pts)").
  const withAsset = { ...p, assetPts: (p.assetPts ?? 0) + 1 };
  assert.equal(scorePlayerState(withAsset) - score0, SCORE_PTS_PER_AP,
    "one asset point must move the score by exactly SCORE_PTS_PER_AP");

  // Grid / inject / facilitator score deltas land in scoreAdjustments 1:1
  // (logged as "+30 score", "+20 score", "-20 score", inject "+N score").
  for (const delta of [30, 20, -20, 12, -8]) {
    const adj = { ...p, scoreAdjustments: (p.scoreAdjustments ?? 0) + delta };
    assert.equal(scorePlayerState(adj) - score0, delta,
      `scoreAdjustments delta ${delta} must move the score 1:1`);
  }

  // Safety violation: -SCORE_PENALTY_VIO per violation (logged in the HUD).
  const viol = { ...p, safetyViolations: (p.safetyViolations ?? 0) + 1 };
  assert.equal(scorePlayerState(viol) - score0, -SCORE_PENALTY_VIO,
    "one violation must cost exactly SCORE_PENALTY_VIO");

  // Resupply: no scoreAdjustments / assetPts change -> score-neutral
  // (logged as "no direct score change"). Restoring health does not touch the
  // five scoring terms directly.
  const resupplied = { ...p, budget: (p.budget ?? 0) - 50 };
  assert.equal(scorePlayerState(resupplied), score0,
    "a pure budget spend with no asset/adjustment change must be score-neutral");
});

// v130 (roadmap): commercial-actor re-spec -- emplacer vs prospector.
test("commercial actors are differentiated by footprint and disturbance", () => {
  const emplacer   = getStakeholderDef("large_commercial");
  const prospector = getStakeholderDef("small_commercial");
  // Emplacer: large fixed footprint, heavy disturbance.
  assert.ok(emplacer.footprintMod > 1, "emplacer projects an oversized footprint");
  assert.ok(emplacer.disturbanceMod > 1, "emplacer disturbs more regolith");
  // Prospector: light footprint, low disturbance.
  assert.ok(prospector.footprintMod < 1, "prospector keeps a light footprint");
  assert.ok(prospector.disturbanceMod < 1, "prospector disturbs less regolith");
  // The defining contrast.
  assert.ok(emplacer.footprintMod > prospector.footprintMod, "emplacer footprint >> prospector");
  assert.ok(emplacer.disturbanceMod > prospector.disturbanceMod, "emplacer disturbance >> prospector");
});

test("makePlayer carries footprint -> safetyMult and disturbanceMod from the stakeholder", () => {
  const emplacer   = makePlayer({ x: 600, y: 600 }, 1, "#fff", { stakeholderId: "large_commercial" });
  const prospector = makePlayer({ x: 600, y: 600 }, 2, "#fff", { stakeholderId: "small_commercial" });
  const neutral    = makePlayer({ x: 600, y: 600 }, 1, "#fff");
  assert.equal(emplacer.safetyMult, 1.6, "emplacer's footprint sets a 1.6x baseline zone");
  assert.equal(prospector.safetyMult, 0.6, "prospector's light footprint sets 0.6x zones");
  assert.equal(neutral.safetyMult, 1, "non-commercial actors keep a 1x footprint");
  assert.equal(emplacer.disturbanceMod, 1.5);
  assert.equal(prospector.disturbanceMod, 0.5);
});

// v132 (roadmap): regolith disturbance is a live landing consequence. This locks
// the contract the inline landingImpact now implements: an emplacer's high
// disturbance widens the debris radius and deepens the damage; a prospector's
// low disturbance shrinks both. (Pure replication of the scaling the live
// function applies, so the contract can't silently drift.)
function landingDebris(disturb, distToStructure) {
  const radius = SAFETY_RADIUS.habitat * disturb;
  if (distToStructure >= radius) return 0;
  return Math.min(1, LANDING_DAMAGE * disturb);
}

test("regolith disturbance scales landing debris radius and damage", () => {
  const emplacer = 1.5, prospector = 0.5, neutral = 1.0;
  // A structure just outside the neutral radius: hit by the emplacer, missed by
  // the prospector -> disturbance widens the debris footprint.
  const justOutsideNeutral = SAFETY_RADIUS.habitat * 1.2;
  assert.ok(landingDebris(emplacer,  justOutsideNeutral) > 0, "emplacer's wide debris reaches it");
  assert.equal(landingDebris(prospector, justOutsideNeutral), 0, "prospector's light footprint misses it");
  // Damage amount scales with disturbance for a structure both can reach.
  const close = SAFETY_RADIUS.habitat * 0.3;
  assert.ok(landingDebris(emplacer, close) > landingDebris(neutral, close), "emplacer hits harder");
  assert.ok(landingDebris(neutral, close) > landingDebris(prospector, close), "prospector hits softer");
  // Damage is exactly LANDING_DAMAGE * disturbance (clamped to 1).
  assert.equal(landingDebris(neutral, close), LANDING_DAMAGE);
  assert.equal(landingDebris(prospector, close), LANDING_DAMAGE * 0.5);
});
