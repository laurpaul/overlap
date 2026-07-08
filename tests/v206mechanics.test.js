// v206 mechanics:
//  · governance regimes weight safety-violation attribution (ITU ×2, ATCM ×1.5)
//  · autoseek only targets craters the rover can afford round-trip
//  · a stranded (zero-battery) rover takes a daily score penalty

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  makePlayer, attributeSafetyViolations,
  governanceViolationWeight, governanceIdForPreset, GOVERNANCE_EFFECTS,
  applyStrandedRoverPenalty, STRANDED_ROVER_PENALTY,
  pickRoverTarget, estimateRoundTripNeed, collectRechargeHomes,
} from "../src/sim/index.js";
import { getScenarioPreset } from "../src/sim/scenarioPresets.js";
import {
  PSR_MASK, RIDGE_MASK, PIXEL_CRATER, ICE_DEPTH_MAP, SLOPE_MAP, EARTH_VIS_MAP,
  CRATER_DATA,
} from "../src/sim/mapData.js";
import { W, POWER_CAP } from "../src/sim/constants.js";

// ── governance weights ──────────────────────────────────────────────────────

test("governance weight table: itu ×2, atcm ×1.5, unknown → 1", () => {
  assert.equal(governanceViolationWeight("itu"), 2.0);
  assert.equal(governanceViolationWeight("atcm"), 1.5);
  assert.equal(governanceViolationWeight("standard"), 1.0);
  assert.equal(governanceViolationWeight(null), 1.0);
});

test("governanceIdForPreset resolves mechanical regimes from presets", () => {
  assert.equal(governanceIdForPreset(getScenarioPreset("itu")), "itu");
  assert.equal(governanceIdForPreset(getScenarioPreset("atcm")), "atcm");
  assert.equal(governanceIdForPreset(getScenarioPreset("standard")), null);
});

function violationPair() {
  // Owner P1 placed first (seq 1); P2's rover (seq 5) sits inside P1's base zone.
  const p1 = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p1.x = 500; p1.y = 500; p1._seq = 1;
  const p2 = makePlayer({ x: 500, y: 500 }, 2, "#fff");
  p2.x = 502; p2.y = 500; p2._seq = 5;
  return [p1, p2];
}

test("ITU weighting doubles the attributed violation count", () => {
  const [p1a, p2a] = violationPair();
  const base = attributeSafetyViolations(p1a, p2a, {});
  const [p1b, p2b] = violationPair();
  const itu = attributeSafetyViolations(p1b, p2b, { violationWeight: governanceViolationWeight("itu") });
  const baseTotal = base.v1 + base.v2;
  const ituTotal = itu.v1 + itu.v2;
  assert.ok(baseTotal > 0, "the pair should register at least one violation");
  assert.ok(Math.abs(ituTotal - 2 * baseTotal) < 1e-9,
    `ITU total ${ituTotal} should be exactly double the standard ${baseTotal}`);
});

// ── stranded-rover penalty ──────────────────────────────────────────────────

test("stranded rover charges STRANDED_ROVER_PENALTY per dead rover per day", () => {
  const p = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p.power = 0;
  p.extraRovers = [{ x: 510, y: 500, power: 0 }, { x: 520, y: 500, power: 50 }];
  p.structureHealth = { ...(p.structureHealth || {}), extraRovers: [1.0, 1.0] };
  const before = p.scoreAdjustments ?? 0;
  const out = applyStrandedRoverPenalty(p);
  assert.equal(out.count, 2, "primary + one extra rover are stranded");
  assert.equal(out.player.scoreAdjustments, before - 2 * STRANDED_ROVER_PENALTY);
  assert.equal(out.events.length, 2);
  assert.ok(out.events.every(e => e.type === "stranded_penalty"));
});

test("powered rovers take no stranded penalty", () => {
  const p = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p.power = 40;
  const out = applyStrandedRoverPenalty(p);
  assert.equal(out.count, 0);
  assert.equal(out.player, p, "no-op returns the same player object");
});

// ── energy-budgeted autoseek ────────────────────────────────────────────────

const CX = 700, CY = 700;
function installTwoPSRs(farDx) {
  for (let dy = -14; dy <= 14; dy++)
    for (let dx = -14; dx <= 14; dx++) {
      const idx = (CY + dy) * W + (CX + dx);
      PSR_MASK[idx] = 0; PIXEL_CRATER[idx] = -1; ICE_DEPTH_MAP[idx] = 0;
      SLOPE_MAP[idx] = 0; EARTH_VIS_MAP[idx] = 1; RIDGE_MASK[idx] = 0;
    }
  CRATER_DATA.length = 0;
  // near crater at CX+farDx (index 0), the only candidates the rover sees
  CRATER_DATA[0] = { cx: CX + farDx, cy: CY, mineX: CX + farDx, mineY: CY, size: 20, quality: 0.9, pixels: [] };
}

test("autoseek targets an affordable crater", () => {
  installTwoPSRs(30); // 30 px away, cheap round trip
  const p = makePlayer({ x: CX, y: CY }, 1, "#fff");
  p.x = CX; p.y = CY;
  p.power = POWER_CAP; // full battery
  p.waypoints = []; p.currentWaypoint = null;
  const ch = new Float32Array(1).fill(1.0);
  const t = pickRoverTarget(p, p, ch);
  assert.ok(t, "expected a target");
  assert.equal(t.reason, "autoseek");
});

test("autoseek refuses an unaffordable crater and recharges instead", () => {
  installTwoPSRs(75); // ~75 px trip: affordable on a full charge, not on 45%
  const p = makePlayer({ x: CX, y: CY }, 1, "#fff");
  p.x = CX; p.y = CY;
  p.power = POWER_CAP * 0.45; // above the recharge trigger, below the trip need
  p.waypoints = []; p.currentWaypoint = null;
  p.panels = [{ x: CX - 5, y: CY }]; // a recharge home nearby
  p.structureHealth = { ...(p.structureHealth || {}), panels: [1.0] };
  const homes = collectRechargeHomes(p);
  const need = estimateRoundTripNeed({ x: CX, y: CY }, { x: CX + 75, y: CY }, homes);
  assert.ok(need > p.power && need <= POWER_CAP * 0.95,
    `sanity: need ${need.toFixed(0)} should be in the recharge-first band (power ${p.power}, cap ${POWER_CAP})`);
  const ch = new Float32Array(1).fill(1.0);
  const t = pickRoverTarget(p, p, ch);
  assert.ok(t, "expected a target");
  assert.equal(t.reason, "recharge",
    "an unaffordable-only board must route to recharge, not into the trap");
});

// ── v207: recovery convoy ───────────────────────────────────────────────────

import { applyRoverRescue, RESCUE_DELAY_DAYS, RESCUE_COST_CR, RESCUE_POWER_FRAC } from "../src/sim/index.js";

test("a funded actor rescues a rover after the delay; broke actors stay down", () => {
  const p = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p.power = 0; p.budget = 500;
  // day 0: stranding is noticed (timer starts), no rescue yet
  let out = applyRoverRescue(p, 10, POWER_CAP);
  assert.equal(out.events.length, 0);
  assert.equal(out.player._strandedSince, 10);
  // before the delay elapses: still down
  out = applyRoverRescue(out.player, 10 + RESCUE_DELAY_DAYS - 1, POWER_CAP);
  assert.equal(out.events.length, 0);
  // delay elapsed + funded: rescued, paid, recharged to the limp-home fraction
  out = applyRoverRescue(out.player, 10 + RESCUE_DELAY_DAYS, POWER_CAP);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].type, "rover_rescued");
  assert.equal(out.player.budget, 500 - RESCUE_COST_CR);
  assert.ok(Math.abs(out.player.power - POWER_CAP * RESCUE_POWER_FRAC) < 1e-9);
  assert.equal(out.player._strandedSince, null);
});

test("an unfunded actor's rover stays stranded", () => {
  const p = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p.power = 0; p.budget = RESCUE_COST_CR - 1;
  let out = applyRoverRescue(p, 20, POWER_CAP);
  out = applyRoverRescue(out.player, 20 + RESCUE_DELAY_DAYS + 5, POWER_CAP);
  assert.equal(out.events.length, 0, "no rescue without the credits");
  assert.equal(out.player.power, 0);
});

test("a rover that recovers on its own clears the stranded timer", () => {
  const p = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p.power = 0; p.budget = 500;
  let out = applyRoverRescue(p, 30, POWER_CAP);
  assert.equal(out.player._strandedSince, 30);
  out.player.power = 60; // recharged by other means
  out = applyRoverRescue(out.player, 31, POWER_CAP);
  assert.equal(out.player._strandedSince, null, "timer must reset once powered");
});

// ── v209: predictive pre-night return ───────────────────────────────────────

import { daysUntilNight } from "../src/sim/index.js";
import { rechargeTriggerThreshold } from "../src/sim/autoTarget.js";

test("daysUntilNight tracks the 7/7 cycle", () => {
  assert.equal(daysUntilNight(0), 7);
  assert.equal(daysUntilNight(6), 1);
  assert.equal(daysUntilNight(7), 0);   // night begins
  assert.equal(daysUntilNight(13), 0);  // still night
  assert.equal(daysUntilNight(14), 7);  // dawn
});

test("the trigger rises when night is imminent relative to the trip home", () => {
  installTwoPSRs(30);
  const p = makePlayer({ x: CX, y: CY }, 1, "#fff");
  p.x = CX; p.y = CY;
  p.panels = [{ x: CX - 90, y: CY }]; // ~90 px = ~3 travel days home
  p.structureHealth = { ...(p.structureHealth || {}), panels: [1.0] };
  const rover = { x: CX, y: CY, power: 60, _recharging: false };
  const midDay = rechargeTriggerThreshold(rover, p, CX, CY, { night: false, globalDay: 0 }); // 7 days of light
  const preNight = rechargeTriggerThreshold(rover, p, CX, CY, { night: false, globalDay: 5 }); // 2 days left < trip
  assert.ok(preNight > midDay,
    `pre-night trigger (${preNight.toFixed(1)}) must exceed mid-day trigger (${midDay.toFixed(1)})`);
});

// ── v212: strategic-reserve scoring ─────────────────────────────────────────

import { scorePlayerState, scoreBreakdown, RESERVE_END_MULT, SCORE_PTS_PER_KG } from "../src/sim/index.js";

test("reserve kilograms score at RESERVE_END_MULT; absent reserve is a no-op", () => {
  const p = makePlayer({ x: 500, y: 500 }, 1, "#fff");
  p.iceDeposited = 100;
  const baseScore = scorePlayerState(p);
  p.reserveKg = 40;
  const withReserve = scorePlayerState(p);
  assert.ok(Math.abs((withReserve - baseScore) - 40 * SCORE_PTS_PER_KG * RESERVE_END_MULT) < 1e-9);
  const bd = scoreBreakdown(p);
  const term = bd.terms.find(t => t.key === "reserve");
  assert.ok(term, "breakdown must expose the reserve term");
  assert.ok(Math.abs(term.value - 60) < 1e-9);
});

test("strategic_reserve preset carries the escrow override", () => {
  const preset = getScenarioPreset("strategic_reserve");
  assert.equal(preset.overrides?.RESERVE_ESCROW_FRAC, 0.25);
});
